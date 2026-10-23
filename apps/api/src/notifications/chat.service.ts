import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from './notifications.service';
import { JwtPayload, UserRole } from '../common/interfaces/jwt-payload.interface';
import { SendMessageDto } from './dto/messages.dto';
import { MIN_SEARCH_LENGTH } from '../common/domain/search';
import { personSearch } from '../prisma/person-search';
import { plural } from '../common/domain/text';
import { NOTIFICATION_REF } from './notification-ref';

/** Mensajes que devuelve una conversación. Basta para el historial visible. */
const CONVERSATION_LIMIT = 200;

/** Candidatos que devuelve la búsqueda de contactos. */
const CANDIDATES_LIMIT = 50;

/** Avisos de la campana que corresponden a un mensaje; su referencia es quien lo envió. */

const NO_SHARED_COURSE = 'Sólo puedes contactar con personas de un curso que compartan.';

const CANNOT_WRITE =
  'No puedes escribir a esta persona: necesitan compartir un curso activo y haber aceptado la solicitud de contacto.';

/** Lo que hace falta de alguien para decidir si se le puede escribir. */
interface Person {
  guid: string;
  role: UserRole;
}

/**
 * Mensajería entre usuarios de una misma sede.
 *
 * Quién puede escribir a quién lo decide `writableAmong`, y se comprueba en el servidor:
 * conocer el identificador de una persona no basta para escribirle, y menos aún a alguien
 * de la otra sede.
 *  - Con un administrador la conversación está abierta en los dos sentidos: atiende a
 *    toda su sede y puede escribir a cualquiera sin solicitud.
 *  - El examinador de un curso y sus alumnos activos se escriben sin solicitud.
 *  - Entre los demás hace falta una solicitud aceptada **y** seguir compartiendo un curso
 *    activo: quien se da de baja deja de recibir mensajes, aunque conserva el historial.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Mensajes ─────────────────────────────────────────────────────────────

  /** Envía un mensaje a alguien a quien el usuario puede escribir. */
  async sendMessage(dto: SendMessageDto, user: JwtPayload) {
    if (dto.recipientGuid === user.sub) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo.');
    }

    const recipient = await this.sameCountryUser(user, dto.recipientGuid);
    if (!(await this.writableAmong(user, [recipient])).has(recipient.guid)) {
      throw new ForbiddenException(CANNOT_WRITE);
    }

    const message = await this.prisma.message.create({
      data: {
        senderGuid: user.sub,
        recipientGuid: recipient.guid,
        subject: dto.subject,
        content: dto.content,
        refType: dto.refType,
        refGuid: dto.refGuid,
      },
    });

    const senderName = await this.displayName(user.sub);

    // La referencia es quien escribe: al leer la conversación se marcan sus avisos.
    await this.notifications.create({
      userGuid: recipient.guid,
      country: user.country,
      type: 'NEW_MESSAGE',
      title: `Mensaje de ${senderName}`,
      message: dto.subject,
      actionUrl: '/dashboard/messages',
      refType: NOTIFICATION_REF.person,
      refGuid: user.sub,
    });

    this.realtime.emitToUsers(
      'message:new',
      {
        id: message.id,
        senderGuid: user.sub,
        senderName,
        subject: message.subject,
        content: message.content,
        createdAt: message.createdAt,
      },
      user.country,
      [recipient.guid],
    );

    return message;
  }

  /** Historial con otra persona de la sede. Sólo contiene mensajes del propio usuario. */
  async getConversation(contactGuid: string, user: JwtPayload) {
    await this.sameCountryUser(user, contactGuid);

    // Quien vació la conversación no vuelve a ver lo anterior a ese momento; la otra
    // parte sí, porque su copia no se tocó.
    const cutoff = (await this.cutoffByContact(user.sub, [contactGuid])).get(contactGuid);

    // Se piden los más recientes y se devuelven en orden de lectura: con el tope aplicado a
    // un orden ascendente, una conversación larga se quedaría congelada en sus inicios.
    const messages = await this.prisma.message.findMany({
      where: {
        ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
        OR: [
          { senderGuid: user.sub, recipientGuid: contactGuid },
          { senderGuid: contactGuid, recipientGuid: user.sub },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: CONVERSATION_LIMIT,
      select: {
        id: true,
        senderGuid: true,
        subject: true,
        content: true,
        read: true,
        createdAt: true,
      },
    });

    return messages.reverse().map((message) => ({ ...message, isMine: message.senderGuid === user.sub }));
  }

  /** Marca como leídos los mensajes recibidos de un contacto y sus avisos en la campana. */
  async markConversationRead(contactGuid: string, user: JwtPayload) {
    const [messages, notifications] = await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: { senderGuid: contactGuid, recipientGuid: user.sub, read: false },
        data: { read: true },
      }),
      this.markMessageNotificationsRead(contactGuid, user),
    ]);
    this.announceRead(contactGuid, user, messages.count + notifications.count);

    return {
      message: `${messages.count} ${plural(messages.count, 'mensaje marcado como leído', 'mensajes marcados como leídos')}.`,
    };
  }

  /**
   * Vacía la conversación **para quien la borra**.
   *
   * La otra persona conserva la suya: el historial es de cada uno y nadie puede decidir
   * por el otro. Se guarda un punto de corte por pareja en lugar de tocar los mensajes,
   * así que vaciar una conversación larga cuesta una sola escritura. Los mensajes
   * posteriores vuelven a verse, que es lo que se espera al seguir hablando.
   *
   * Cuando las dos partes han ocultado los mismos mensajes, la tarea de mantenimiento los
   * borra de verdad: ya no hay nadie a quien enseñárselos.
   */
  async deleteConversation(contactGuid: string, user: JwtPayload) {
    await this.sameCountryUser(user, contactGuid);
    if (!(await this.hasConversation(user.sub, contactGuid))) {
      throw new NotFoundException('No tienes ninguna conversación con esta persona.');
    }

    const now = new Date();

    const [, messages, notifications] = await this.prisma.$transaction([
      this.prisma.hiddenConversation.upsert({
        where: { userGuid_contactGuid: { userGuid: user.sub, contactGuid } },
        create: { userGuid: user.sub, contactGuid, hiddenUntil: now },
        update: { hiddenUntil: now },
      }),
      // Quien vacía la conversación ya la ha visto: dejar los mensajes como no leídos
      // mantendría un contador señalando a algo que ya no está en pantalla.
      this.prisma.message.updateMany({
        where: { senderGuid: contactGuid, recipientGuid: user.sub, read: false },
        data: { read: true },
      }),
      this.markMessageNotificationsRead(contactGuid, user),
    ]);
    this.announceRead(contactGuid, user, messages.count + notifications.count);

    return { message: 'Conversación eliminada de tu bandeja. La otra persona conserva la suya.' };
  }

  /** Desde cuándo ve el usuario cada conversación. Sin entrada, la ve entera. */
  private async cutoffByContact(userGuid: string, contactGuids: string[]): Promise<Map<string, Date>> {
    if (contactGuids.length === 0) return new Map();

    const cutoffs = await this.prisma.hiddenConversation.findMany({
      where: { userGuid, contactGuid: { in: contactGuids } },
      select: { contactGuid: true, hiddenUntil: true },
    });

    return new Map(cutoffs.map((cutoff) => [cutoff.contactGuid, cutoff.hiddenUntil]));
  }

  private markMessageNotificationsRead(contactGuid: string, user: JwtPayload) {
    return this.prisma.notification.updateMany({
      where: { userGuid: user.sub, refType: NOTIFICATION_REF.person, refGuid: contactGuid, read: false },
      data: { read: true },
    });
  }

  /**
   * Avisa a las sesiones abiertas del usuario de que tiene menos pendientes de leer, para
   * que el contador del menú y la campana se pongan al día.
   */
  private announceRead(contactGuid: string, user: JwtPayload, changes: number) {
    if (changes > 0) this.realtime.emitToUsers('message:read', { contactGuid }, user.country, [user.sub]);
  }

  // ── Contactos ────────────────────────────────────────────────────────────

  /**
   * Personas con las que el usuario puede abrir una conversación: las de sus cursos o,
   * para un administrador, cualquiera de su sede. `canWrite` dice si se le puede escribir
   * ya o hace falta pedir contacto antes.
   */
  async searchContactCandidates(search: string, user: JwtPayload) {
    // Sin texto se listan los primeros; con una sola letra no se busca: casa con casi
    // todos y, para un examinador con muchos cursos, cuesta lo mismo que la lista entera
    // (unos 400 ms con cinco años de alumnos).
    const typed = search.trim();
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) return [];

    const isAdmin = user.role === 'ADMIN';
    const courseGuids = isAdmin ? [] : await this.userCourses(user);
    if (!isAdmin && courseGuids.length === 0) return [];

    const byName = personSearch(typed);

    const candidates = await this.prisma.user.findMany({
      where: {
        country: user.country,
        guid: { not: user.sub },
        // Las condiciones van dentro de `AND` a propósito: como dos claves `OR` en el mismo
        // objeto, la segunda pisaría a la primera y la búsqueda dejaría de exigir curso
        // compartido, con lo que se listaría el directorio entero de la sede.
        AND: [
          ...(isAdmin
            ? []
            : [
                {
                  OR: [
                    { enrollments: { some: { courseGuid: { in: courseGuids }, active: true } } },
                    { taughtCourses: { some: { guid: { in: courseGuids } } } },
                  ],
                },
              ]),
          ...(byName ? [byName] : []),
        ],
      },
      select: { guid: true, firstName: true, lastName: true, email: true, role: true },
      take: CANDIDATES_LIMIT,
      orderBy: [{ firstName: 'asc' }],
    });
    if (candidates.length === 0) return [];

    const candidateGuids = candidates.map((candidate) => candidate.guid);
    const [relations, writable] = await Promise.all([
      this.prisma.chatContact.findMany({
        where: {
          OR: [
            { requesterGuid: user.sub, receiverGuid: { in: candidateGuids } },
            { requesterGuid: { in: candidateGuids }, receiverGuid: user.sub },
          ],
        },
        select: { requesterGuid: true, receiverGuid: true, status: true },
      }),
      this.writableAmong(user, candidates),
    ]);

    const statusByContact = new Map(
      relations.map((relation) => [
        relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
        relation.status,
      ]),
    );

    return candidates.map((candidate) => ({
      ...candidate,
      contactStatus: statusByContact.get(candidate.guid) ?? null,
      canWrite: writable.has(candidate.guid),
    }));
  }

  /**
   * Pide contacto con alguien de un curso compartido. Sólo hace falta entre quienes no
   * pueden escribirse directamente (dos alumnos, por ejemplo).
   */
  async requestContact(receiverGuid: string, courseGuid: string | undefined, user: JwtPayload) {
    if (receiverGuid === user.sub) {
      throw new BadRequestException('No puedes añadirte a ti mismo como contacto.');
    }

    const receiver = await this.sameCountryUser(user, receiverGuid);
    if ((await this.writableAmong(user, [receiver])).has(receiver.guid)) {
      throw new BadRequestException('Ya puedes escribir a esta persona; no hace falta enviar una solicitud.');
    }

    const course = await this.sharedCourse(user, receiverGuid, courseGuid);

    const existing = await this.prisma.chatContact.findFirst({
      where: {
        courseGuid: course.guid,
        OR: [
          { requesterGuid: user.sub, receiverGuid },
          { requesterGuid: receiverGuid, receiverGuid: user.sub },
        ],
      },
    });
    if (existing?.status === 'ACCEPTED') return existing;
    if (existing?.status === 'PENDING') {
      throw new BadRequestException('Ya hay una solicitud pendiente con esta persona.');
    }

    // Una solicitud rechazada puede reintentarse; se reinicia la dirección.
    const contact = existing
      ? await this.prisma.chatContact.update({
          where: { id: existing.id },
          data: { requesterGuid: user.sub, receiverGuid, status: 'PENDING' },
        })
      : await this.prisma.chatContact.create({
          data: { requesterGuid: user.sub, receiverGuid, courseGuid: course.guid, status: 'PENDING' },
        });

    await this.notifications.create({
      userGuid: receiverGuid,
      country: user.country,
      type: 'NEW_MESSAGE',
      title: 'Solicitud de conversación',
      message: `${await this.displayName(user.sub)} quiere iniciar una conversación contigo.`,
      actionUrl: '/dashboard/messages',
      refType: NOTIFICATION_REF.person,
      refGuid: user.sub,
    });
    this.realtime.emitToUsers('contact:updated', {}, user.country, [receiverGuid]);

    return contact;
  }

  /** Acepta o rechaza una solicitud recibida. */
  async respondToRequest(contactId: number, accept: boolean, user: JwtPayload) {
    const contact = await this.prisma.chatContact.findFirst({
      where: { id: contactId, receiverGuid: user.sub, status: 'PENDING' },
    });
    if (!contact) throw new NotFoundException('Solicitud no encontrada.');

    const updated = await this.prisma.chatContact.update({
      where: { id: contactId },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
    });

    if (accept) {
      await this.notifications.create({
        userGuid: contact.requesterGuid,
        country: user.country,
        type: 'NEW_MESSAGE',
        title: 'Solicitud aceptada',
        message: `${await this.displayName(user.sub)} aceptó tu solicitud. Ya pueden conversar.`,
        actionUrl: '/dashboard/messages',
        refType: NOTIFICATION_REF.person,
        refGuid: user.sub,
      });
      // Quien pidió el contacto ve la conversación en su bandeja sin recargar.
      this.realtime.emitToUsers('contact:updated', {}, user.country, [contact.requesterGuid]);
    }

    return updated;
  }

  /** Solicitudes recibidas pendientes de respuesta. */
  async getPendingRequests(user: JwtPayload) {
    const requests = await this.prisma.chatContact.findMany({
      where: { receiverGuid: user.sub, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (requests.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { guid: { in: requests.map((request) => request.requesterGuid) }, country: user.country },
      select: { guid: true, firstName: true, lastName: true, email: true, role: true },
    });
    const byGuid = new Map(users.map((requester) => [requester.guid, requester]));

    return requests.map((request) => ({
      id: request.id,
      courseGuid: request.courseGuid,
      createdAt: request.createdAt,
      requester: byGuid.get(request.requesterGuid) ?? null,
    }));
  }

  /**
   * Conversaciones del usuario: sus contactos aceptados y cualquiera con quien haya
   * intercambiado mensajes (un administrador o un examinador escriben sin solicitud). Cada
   * una con su último mensaje, los pendientes de leer y si todavía puede escribir.
   */
  async getContacts(user: JwtPayload) {
    // Para la vista previa sólo hace falta el último mensaje de cada conversación: se agrupa
    // por pareja —como mucho dos filas por persona, una por sentido— y se pide el
    // identificador más alto, que por ser autoincremental es el mensaje más reciente.
    const [relations, latest] = await Promise.all([
      this.prisma.chatContact.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterGuid: user.sub }, { receiverGuid: user.sub }] },
        select: { requesterGuid: true, receiverGuid: true },
      }),
      this.prisma.message.groupBy({
        by: ['senderGuid', 'recipientGuid'],
        where: { OR: [{ senderGuid: user.sub }, { recipientGuid: user.sub }] },
        _max: { id: true },
      }),
    ]);

    const guids = [
      ...new Set([
        ...relations.map((relation) =>
          relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
        ),
        ...latest.map((row) => (row.senderGuid === user.sub ? row.recipientGuid : row.senderGuid)),
      ]),
    ];
    if (guids.length === 0) return [];

    const recentIds = latest.map((row) => row._max.id).filter((id): id is number => id !== null);
    const [users, unreadCounts, messages, cutoffs] = await Promise.all([
      this.prisma.user.findMany({
        where: { guid: { in: guids }, country: user.country },
        select: { guid: true, firstName: true, lastName: true, role: true, photoUrl: true },
      }),
      this.prisma.message.groupBy({
        by: ['senderGuid'],
        where: { senderGuid: { in: guids }, recipientGuid: user.sub, read: false },
        _count: { id: true },
      }),
      recentIds.length
        ? this.prisma.message.findMany({
            where: { id: { in: recentIds } },
            orderBy: { createdAt: 'desc' },
            select: { senderGuid: true, recipientGuid: true, content: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.cutoffByContact(user.sub, guids),
    ]);
    const writable = await this.writableAmong(user, users);

    const unreadByContact = new Map(unreadCounts.map((row) => [row.senderGuid, row._count.id]));

    // Ordenados de más reciente a más antiguo, el primero de cada contacto es el suyo.
    // Si el último mensaje queda por detrás del corte, es que vació la conversación: el
    // contacto sigue en la lista, pero sin nada que previsualizar.
    const lastByContact = new Map<string, { content: string; createdAt: Date }>();
    for (const message of messages) {
      const contact = message.senderGuid === user.sub ? message.recipientGuid : message.senderGuid;
      if (lastByContact.has(contact)) continue;

      const cutoff = cutoffs.get(contact);
      if (cutoff && message.createdAt <= cutoff) continue;

      lastByContact.set(contact, { content: message.content, createdAt: message.createdAt });
    }

    return users
      .map((contact) => ({
        guid: contact.guid,
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: contact.role,
        photoUrl: contact.photoUrl,
        lastMessage: lastByContact.get(contact.guid)?.content ?? '',
        lastMessageAt: lastByContact.get(contact.guid)?.createdAt ?? null,
        unreadCount: unreadByContact.get(contact.guid) ?? 0,
        canWrite: writable.has(contact.guid),
      }))
      .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  }

  // ── Comprobaciones ───────────────────────────────────────────────────────

  /** La otra persona, siempre de la sede del usuario: la de otra sede no existe para él. */
  private async sameCountryUser(user: JwtPayload, guid: string): Promise<Person> {
    const person = await this.prisma.user.findFirst({
      where: { guid, country: user.country },
      select: { guid: true, role: true },
    });
    if (!person) throw new NotFoundException('Usuario no encontrado.');
    return person;
  }

  /**
   * De las personas indicadas —todas de la sede del usuario—, a cuáles puede escribir
   * (las reglas, en la documentación de la clase).
   */
  private async writableAmong(user: JwtPayload, people: Person[]): Promise<Set<string>> {
    if (user.role === 'ADMIN') return new Set(people.map((person) => person.guid));

    const writable = new Set(people.filter((person) => person.role === 'ADMIN').map((person) => person.guid));
    const others = people.filter((person) => person.role !== 'ADMIN').map((person) => person.guid);
    if (others.length === 0) return writable;

    const [courses, accepted] = await Promise.all([
      // Cursos del usuario en los que participa alguno de los demás.
      this.prisma.course.findMany({
        where: {
          country: user.country,
          AND: [
            { OR: [{ teacherGuid: user.sub }, { enrollments: { some: { userGuid: user.sub, active: true } } }] },
            {
              OR: [
                { teacherGuid: { in: others } },
                { enrollments: { some: { userGuid: { in: others }, active: true } } },
              ],
            },
          ],
        },
        select: {
          teacherGuid: true,
          enrollments: { where: { userGuid: { in: others }, active: true }, select: { userGuid: true } },
        },
      }),
      this.prisma.chatContact.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterGuid: user.sub, receiverGuid: { in: others } },
            { requesterGuid: { in: others }, receiverGuid: user.sub },
          ],
        },
        select: { requesterGuid: true, receiverGuid: true },
      }),
    ]);

    const acceptedGuids = new Set(
      accepted.map((relation) =>
        relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
      ),
    );

    for (const course of courses) {
      const teaches = course.teacherGuid === user.sub;
      // Si el examinador es otro, el usuario es alumno de este curso: es su examinador.
      if (!teaches && others.includes(course.teacherGuid)) writable.add(course.teacherGuid);
      for (const { userGuid } of course.enrollments) {
        if (teaches || acceptedGuids.has(userGuid)) writable.add(userGuid);
      }
    }

    return writable;
  }

  /** Si hay algo que vaciar: un contacto aceptado o algún mensaje entre los dos. */
  private async hasConversation(userGuid: string, contactGuid: string): Promise<boolean> {
    const [contact, message] = await Promise.all([
      this.prisma.chatContact.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterGuid: userGuid, receiverGuid: contactGuid },
            { requesterGuid: contactGuid, receiverGuid: userGuid },
          ],
        },
        select: { id: true },
      }),
      this.prisma.message.findFirst({
        where: {
          OR: [
            { senderGuid: userGuid, recipientGuid: contactGuid },
            { senderGuid: contactGuid, recipientGuid: userGuid },
          ],
        },
        select: { id: true },
      }),
    ]);
    return Boolean(contact ?? message);
  }

  /** Nombre con el que se presenta a alguien en un aviso. */
  private async displayName(userGuid: string): Promise<string> {
    const person = await this.prisma.user.findUnique({
      where: { guid: userGuid },
      select: { firstName: true, lastName: true },
    });
    return person ? `${person.firstName} ${person.lastName}` : 'Un usuario';
  }

  /** Cursos en los que el usuario participa, como alumno o como responsable. */
  private async userCourses(user: JwtPayload): Promise<string[]> {
    const [enrollments, taught] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userGuid: user.sub, active: true },
        select: { courseGuid: true },
      }),
      this.prisma.course.findMany({
        where: { teacherGuid: user.sub, country: user.country },
        select: { guid: true },
      }),
    ]);

    return [
      ...new Set([...enrollments.map((enrollment) => enrollment.courseGuid), ...taught.map((course) => course.guid)]),
    ];
  }

  /**
   * Devuelve el curso por el que dos personas pueden hablar.
   *
   * Con curso indicado se comprueba ese; sin él se busca el primero que compartan. En los
   * dos casos la respuesta es la misma regla: sin curso común no hay conversación.
   */
  private async sharedCourse(user: JwtPayload, receiverGuid: string, courseGuid?: string) {
    if (courseGuid) {
      const course = await this.prisma.course.findFirst({
        where: { guid: courseGuid, country: user.country },
        select: { guid: true },
      });
      if (!course) throw new NotFoundException('Curso no encontrado.');

      if (!(await this.shareCourse(user.sub, receiverGuid, courseGuid))) {
        throw new ForbiddenException(NO_SHARED_COURSE);
      }
      return course;
    }

    const ownCourses = await this.userCourses(user);
    const shared = await this.prisma.course.findFirst({
      where: {
        guid: { in: ownCourses },
        country: user.country,
        OR: [{ teacherGuid: receiverGuid }, { enrollments: { some: { userGuid: receiverGuid, active: true } } }],
      },
      select: { guid: true },
    });
    if (!shared) throw new ForbiddenException(NO_SHARED_COURSE);
    return shared;
  }

  /** Comprueba que ambas personas participan en el curso indicado. */
  private async shareCourse(oneGuid: string, otherGuid: string, courseGuid: string): Promise<boolean> {
    const participants = await this.prisma.course.findFirst({
      where: {
        guid: courseGuid,
        OR: [
          { teacherGuid: { in: [oneGuid, otherGuid] } },
          { enrollments: { some: { userGuid: { in: [oneGuid, otherGuid] }, active: true } } },
        ],
      },
      select: {
        teacherGuid: true,
        enrollments: {
          where: { userGuid: { in: [oneGuid, otherGuid] }, active: true },
          select: { userGuid: true },
        },
      },
    });
    if (!participants) return false;

    const members = new Set([
      participants.teacherGuid,
      ...participants.enrollments.map((enrollment) => enrollment.userGuid),
    ]);
    return members.has(oneGuid) && members.has(otherGuid);
  }
}
