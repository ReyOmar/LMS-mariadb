import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Country } from '../common/domain/country';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Notificaciones que se devuelven por defecto en el centro de avisos. */
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** Datos para crear un aviso en la aplicación. */
export interface NewNotification {
  userGuid: string;
  country: Country;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  refType?: string;
  refGuid?: string;
}

/**
 * Avisos dentro de la aplicación. Toda lectura y escritura está acotada al destinatario:
 * nadie puede leer, marcar ni borrar los avisos de otro.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Crea el aviso y lo empuja en tiempo real a su destinatario. */
  async create(data: NewNotification) {
    const { country, ...fields } = data;
    const notification = await this.prisma.notification.create({ data: fields });

    this.realtime.emitToUsers(
      'notification:new',
      {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        read: false,
        createdAt: notification.createdAt,
      },
      country,
      [data.userGuid],
    );

    return notification;
  }

  /** Últimos avisos del usuario en sesión. */
  getUserNotifications(user: JwtPayload, limit = DEFAULT_LIMIT) {
    return this.prisma.notification.findMany({
      where: { userGuid: user.sub },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), MAX_LIMIT),
    });
  }

  async countUnread(user: JwtPayload) {
    const total = await this.prisma.notification.count({
      where: { userGuid: user.sub, read: false },
    });
    return { total };
  }

  async markAllRead(user: JwtPayload) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userGuid: user.sub, read: false },
      data: { read: true },
    });
    return { message: `${count} notificación(es) marcadas como leídas.` };
  }

  async clear(user: JwtPayload) {
    const { count } = await this.prisma.notification.deleteMany({ where: { userGuid: user.sub } });
    return { message: `${count} notificación(es) eliminadas.` };
  }
}
