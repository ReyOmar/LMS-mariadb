import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from './notifications.service';
import { ChatAccess } from './chat-access';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SendMessageDto } from './dto/messages.dto';
import { plural } from '../common/domain/text';
import { NOTIFICATION_REF } from './notification-ref';

/** Mensajes que devuelve una conversación. Basta para el historial visible. */
const CONVERSATION_LIMIT = 200;

const CANNOT_WRITE =
  'No puedes escribir a esta persona: necesitan compartir un curso activo y haber aceptado la solicitud de contacto.';

/**
 * Mensajería entre usuarios de una misma sede: la bandeja de cada uno y sus conversaciones.
 * A quién puede escribir cada cual lo decide `ChatAccess`.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly access: ChatAccess,
  ) {}

  // ── Bandeja ──────────────────────────────────────────────────────────────

  /**
   * Conversaciones del usuario: sus contactos aceptados y cualquiera con quien haya
   * intercambiado mensajes (un administrador o un examinador escriben sin solicitud). Cada
   * una con su último mensaje, los pendientes de leer y si todavía puede escribir.
   */
  async getConversations(user: JwtPayload) {
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
    const writable = await this.access.writableAmong(user, users);

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

  // ── Mensajes ─────────────────────────────────────────────────────────────

  /** Envía un mensaje a alguien a quien el usuario puede escribir. */
  async sendMessage(dto: SendMessageDto, user: JwtPayload) {
    if (dto.recipientGuid === user.sub) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo.');
    }

    const recipient = await this.access.person(user, dto.recipientGuid);
    if (!(await this.access.writableAmong(user, [recipient])).has(recipient.guid)) {
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

    const senderName = await this.access.nameOf(user.sub);

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
    await this.access.person(user, contactGuid);

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
    await this.access.person(user, contactGuid);
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
}
