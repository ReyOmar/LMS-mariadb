import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from './notifications.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SendMessageDto } from './dto/messages.dto';
import { MIN_SEARCH_LENGTH, searchTerm } from '../common/domain/search';

/** Mensajes que devuelve una conversación. Basta para el historial visible. */
const CONVERSATION_LIMIT = 200;

/** Candidatos que devuelve la búsqueda de contactos. */
const CANDIDATES_LIMIT = 50;

const NO_SHARED_COURSE = 'Sólo puedes contactar con personas de un curso que compartan.';

/**
 * Mensajería entre usuarios, con aprobación previa.
 *
 * Sólo se puede pedir contacto a alguien de un curso compartido, y sólo se puede escribir
 * tras aceptar la solicitud (`ensureAcceptedContact`). Las dos reglas se comprueban en el
 * servidor: conocer el identificador de una persona no basta para escribirle, y menos aún
 * a alguien de la otra sede.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Mensajes ─────────────────────────────────────────────────────────────

  /** Envía un mensaje a un contacto aceptado. */
  async sendMessage(dto: SendMessageDto, user: JwtPayload) {
    if (dto.recipientGuid === user.sub) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo.');
    }

    const recipient = await this.ensureAcceptedContact(user, dto.recipientGuid);

    const message = await this.prisma.message.create({
      data: {
        senderGuid: user.sub,
        recipientGuid: dto.recipientGuid,
        subject: dto.subject,
        content: dto.content,
        refType: dto.refType,
        refGuid: dto.refGuid,
      },
    });

    const senderName = await this.displayName(user.sub);

    await this.notifications.create({
      userGuid: dto.recipientGuid,
      country: recipient.country,
      type: 'NEW_MESSAGE',
      title: `Mensaje de ${senderName}`,
      message: dto.subject,
      actionUrl: '/dashboard/messages',
      refType: 'mensaje',
      refGuid: String(message.id),
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
      recipient.country,
      [dto.recipientGuid],
    );

    return message;
  }

  /** Historial con un contacto. */
  async getConversation(contactGuid: string, user: JwtPayload) {
    await this.ensureAcceptedContact(user, contactGuid);

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

  async markConversationRead(contactGuid: string, user: JwtPayload) {
    const { count } = await this.prisma.message.updateMany({
      where: { senderGuid: contactGuid, recipientGuid: user.sub, read: false },
      data: { read: true },
    });
    return { message: `${count} mensaje(s) marcados como leídos.` };
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
    const now = new Date();

    await this.prisma.$transaction([
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
    ]);

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

  // ── Contactos ────────────────────────────────────────────────────────────

  /**
   * Personas con las que el usuario comparte curso y con las que, por tanto, puede abrir
   * una conversación. La consulta ya está acotada a la sede porque un curso pertenece a
   * una sola sede y sólo se mira entre los cursos del propio usuario.
   */
  async searchContactCandidates(search: string, user: JwtPayload) {
    // Sin texto se listan los primeros de sus cursos; con una sola letra no se busca: casa
    // con casi todos y, para un examinador con muchos cursos, cuesta lo mismo que la lista
    // entera (unos 400 ms con cinco años de alumnos).
    const typed = search.trim();
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) return [];

    const courseGuids = await this.userCourses(user);
    if (courseGuids.length === 0) return [];

    const term = searchTerm(typed);

    const candidates = await this.prisma.user.findMany({
      where: {
        country: user.country,
        guid: { not: user.sub },
        // Las dos condiciones van dentro de `AND` a propósito: como dos claves `OR` en el
        // mismo objeto, la segunda pisaría a la primera y la búsqueda dejaría de exigir
        // curso compartido, con lo que se listaría el directorio entero de la sede.
        AND: [
          {
            OR: [
              { enrollments: { some: { courseGuid: { in: courseGuids }, active: true } } },
              { taughtCourses: { some: { guid: { in: courseGuids } } } },
            ],
          },
          ...(term
            ? [
                {
                  OR: [
                    { firstName: { contains: term } },
                    { lastName: { contains: term } },
                    { email: { contains: term } },
                  ],
                },
              ]
            : []),
        ],
      },
      select: { guid: true, firstName: true, lastName: true, email: true, role: true },
      take: CANDIDATES_LIMIT,
      orderBy: [{ firstName: 'asc' }],
    });
    if (candidates.length === 0) return [];

    const candidateGuids = candidates.map((candidate) => candidate.guid);
    const relations = await this.prisma.chatContact.findMany({
      where: {
        OR: [
          { requesterGuid: user.sub, receiverGuid: { in: candidateGuids } },
          { requesterGuid: { in: candidateGuids }, receiverGuid: user.sub },
        ],
      },
      select: { requesterGuid: true, receiverGuid: true, status: true },
    });

    const statusByContact = new Map(
      relations.map((relation) => [
        relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
        relation.status,
      ]),
    );

    return candidates.map((candidate) => ({
      ...candidate,
      contactStatus: statusByContact.get(candidate.guid) ?? null,
      isExaminer: candidate.role !== 'STUDENT',
    }));
  }

  /**
   * Pide contacto con alguien de un curso compartido.
   * Escribir a un examinador del curso no necesita aprobación: es la vía por la que un
   * alumno pide ayuda y exigir que el profesor la acepte primero la bloquearía.
   */
  async requestContact(receiverGuid: string, courseGuid: string | undefined, user: JwtPayload) {
    if (receiverGuid === user.sub) {
      throw new BadRequestException('No puedes añadirte a ti mismo como contacto.');
    }

    const course = await this.sharedCourse(user, receiverGuid, courseGuid);

    const isExaminer = course.teacherGuid === receiverGuid;
    const initialStatus = isExaminer ? 'ACCEPTED' : 'PENDING';

    const existing = await this.prisma.chatContact.findFirst({
      where: {
        courseGuid: course.guid,
        OR: [
          { requesterGuid: user.sub, receiverGuid },
          { requesterGuid: receiverGuid, receiverGuid: user.sub },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') return existing;
      if (existing.status === 'PENDING') {
        throw new BadRequestException('Ya hay una solicitud pendiente con esta persona.');
      }
      // Una solicitud rechazada puede reintentarse; se reinicia la dirección.
      return this.prisma.chatContact.update({
        where: { id: existing.id },
        data: { requesterGuid: user.sub, receiverGuid, status: initialStatus },
      });
    }

    const contact = await this.prisma.chatContact.create({
      data: { requesterGuid: user.sub, receiverGuid, courseGuid: course.guid, status: initialStatus },
    });

    if (!isExaminer) {
      await this.notifications.create({
        userGuid: receiverGuid,
        country: user.country,
        type: 'NEW_MESSAGE',
        title: 'Solicitud de conversación',
        message: `${await this.displayName(user.sub)} quiere iniciar una conversación contigo.`,
        actionUrl: '/dashboard/messages',
      });
    }

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
      });
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

  /** Contactos aceptados con su último mensaje y los pendientes de leer. */
  async getContacts(user: JwtPayload) {
    const relations = await this.prisma.chatContact.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterGuid: user.sub }, { receiverGuid: user.sub }] },
      select: { requesterGuid: true, receiverGuid: true },
    });

    const guids = [
      ...new Set(
        relations.map((relation) =>
          relation.requesterGuid === user.sub ? relation.receiverGuid : relation.requesterGuid,
        ),
      ),
    ];
    if (guids.length === 0) return [];

    const betweenBoth = {
      OR: [
        { senderGuid: user.sub, recipientGuid: { in: guids } },
        { senderGuid: { in: guids }, recipientGuid: user.sub },
      ],
    };

    // Para la vista previa sólo hace falta el último mensaje de cada conversación: se agrupa
    // por pareja —como mucho dos filas por contacto, una por sentido— y se pide el
    // identificador más alto, que por ser autoincremental es el mensaje más reciente.
    const [users, latest, unreadCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { guid: { in: guids }, country: user.country },
        select: { guid: true, firstName: true, lastName: true, role: true, photoUrl: true },
      }),
      this.prisma.message.groupBy({
        by: ['senderGuid', 'recipientGuid'],
        where: betweenBoth,
        _max: { id: true },
      }),
      this.prisma.message.groupBy({
        by: ['senderGuid'],
        where: { senderGuid: { in: guids }, recipientGuid: user.sub, read: false },
        _count: { id: true },
      }),
    ]);

    const unreadByContact = new Map(unreadCounts.map((row) => [row.senderGuid, row._count.id]));

    const recentIds = latest.map((row) => row._max.id).filter((id): id is number => id !== null);
    const [messages, cutoffs] = await Promise.all([
      recentIds.length
        ? this.prisma.message.findMany({
            where: { id: { in: recentIds } },
            orderBy: { createdAt: 'desc' },
            select: { senderGuid: true, recipientGuid: true, content: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.cutoffByContact(user.sub, guids),
    ]);

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
      }))
      .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  }

  // ── Comprobaciones ───────────────────────────────────────────────────────

  /**
   * Exige que exista un contacto aceptado entre ambos.
   * De paso devuelve la sede del destinatario, necesaria para dirigirle los avisos en
   * tiempo real.
   */
  private async ensureAcceptedContact(user: JwtPayload, otherGuid: string) {
    const recipient = await this.prisma.user.findFirst({
      where: { guid: otherGuid, country: user.country },
      select: { guid: true, country: true },
    });
    if (!recipient) throw new NotFoundException('Usuario no encontrado.');

    const contact = await this.prisma.chatContact.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterGuid: user.sub, receiverGuid: otherGuid },
          { requesterGuid: otherGuid, receiverGuid: user.sub },
        ],
      },
      select: { id: true },
    });
    if (!contact) {
      throw new ForbiddenException('Deben aceptar la solicitud de contacto antes de poder escribirse.');
    }

    return recipient;
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
        select: { guid: true, teacherGuid: true },
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
      select: { guid: true, teacherGuid: true },
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
