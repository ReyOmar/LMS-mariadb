import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from './notifications.service';
import { ChatAccess } from './chat-access';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MIN_SEARCH_LENGTH } from '../common/domain/search';
import { personSearch } from '../prisma/person-search';
import { NOTIFICATION_REF } from './notification-ref';

/** Candidatos que devuelve la búsqueda de contactos. */
const CANDIDATES_LIMIT = 50;

const NO_SHARED_COURSE = 'Sólo puedes contactar con personas de un curso que compartan.';

/**
 * Con quién abrir una conversación: la búsqueda entre las personas de los cursos del usuario
 * y las solicitudes de contacto, que necesitan quienes no pueden escribirse directamente —dos
 * alumnos, por ejemplo— (las reglas, en `ChatAccess`).
 */
@Injectable()
export class ChatContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly access: ChatAccess,
  ) {}

  /**
   * Personas con las que el usuario puede abrir una conversación: las de sus cursos o,
   * para un administrador, cualquiera de su sede. `canWrite` dice si se le puede escribir
   * ya o hace falta pedir contacto antes.
   */
  async searchCandidates(search: string, user: JwtPayload) {
    // Sin texto se listan los primeros; con una sola letra no se busca: casa con casi
    // todos y, para un examinador con muchos cursos, cuesta lo mismo que la lista entera
    // (unos 400 ms con cinco años de alumnos).
    const typed = search.trim();
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) return [];

    const isAdmin = user.role === 'ADMIN';
    const courseGuids = isAdmin ? [] : await this.coursesOf(user);
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
      this.access.writableAmong(user, candidates),
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
  async request(receiverGuid: string, courseGuid: string | undefined, user: JwtPayload) {
    if (receiverGuid === user.sub) {
      throw new BadRequestException('No puedes añadirte a ti mismo como contacto.');
    }

    const receiver = await this.access.person(user, receiverGuid);
    if ((await this.access.writableAmong(user, [receiver])).has(receiver.guid)) {
      throw new BadRequestException('Ya puedes escribir a esta persona; no hace falta enviar una solicitud.');
    }

    const course = await this.courseInCommon(user, receiverGuid, courseGuid);

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
      message: `${await this.access.nameOf(user.sub)} quiere iniciar una conversación contigo.`,
      actionUrl: '/dashboard/messages',
      refType: NOTIFICATION_REF.person,
      refGuid: user.sub,
    });
    this.realtime.emitToUsers('contact:updated', {}, user.country, [receiverGuid]);

    return contact;
  }

  /** Acepta o rechaza una solicitud recibida. */
  async respond(contactId: number, accept: boolean, user: JwtPayload) {
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
        message: `${await this.access.nameOf(user.sub)} aceptó tu solicitud. Ya pueden conversar.`,
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
  async pending(user: JwtPayload) {
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

  /** Cursos en los que el usuario participa, como alumno o como responsable. */
  private async coursesOf(user: JwtPayload): Promise<string[]> {
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
  private async courseInCommon(user: JwtPayload, receiverGuid: string, courseGuid?: string) {
    if (courseGuid) {
      const course = await this.prisma.course.findFirst({
        where: { guid: courseGuid, country: user.country },
        select: { guid: true },
      });
      if (!course) throw new NotFoundException('Curso no encontrado.');

      if (!(await this.bothTakePart(user.sub, receiverGuid, courseGuid))) {
        throw new ForbiddenException(NO_SHARED_COURSE);
      }
      return course;
    }

    const ownCourses = await this.coursesOf(user);
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
  private async bothTakePart(oneGuid: string, otherGuid: string, courseGuid: string): Promise<boolean> {
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
