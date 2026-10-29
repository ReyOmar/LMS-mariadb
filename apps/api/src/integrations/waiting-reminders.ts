import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MAIL_CONCURRENCY } from '../mail/mail-transport';
import { NotificationsService } from '../notifications/notifications.service';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { plural } from '../common/domain/text';
import { WAITING_REASON_FIX, WAITING_REASON_TEXT, WaitingReason } from './external-status';
import { ExternalRequest } from './external-request';

/** Cada cuánto se recuerda a los administradores una infracción por la que alguien sigue esperando. */
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Donde los administradores ven lo que espera. */
const INTEGRATIONS_PAGE = '/dashboard/admin/integrations';

interface Admin {
  guid: string;
  email: string;
  firstName: string;
}

/** La infracción como la lee el administrador: el código y, si se conoce, qué es. */
function infractionLabel({ code, description }: ExternalRequest['infraction']): string {
  return description ? `${code} (${description})` : code;
}

/**
 * Avisos a los administradores de la sede de que alguien espera por una infracción cuyo curso
 * todavía no se puede ofrecer, como mucho uno al día por infracción: si llegan cien solicitudes
 * seguidas por la misma, reciben un aviso con el recuento y no cien.
 */
@Injectable()
export class WaitingReminders {
  private readonly logger = new Logger(WaitingReminders.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  async remind(request: ExternalRequest, reason: WaitingReason): Promise<void> {
    const { country, infractionId } = request;
    const alreadyReminded = await this.prisma.externalEnrollment.count({
      where: {
        infractionId,
        status: 'WAITING',
        adminNotifiedAt: { gte: new Date(Date.now() - REMINDER_INTERVAL_MS) },
      },
    });
    if (alreadyReminded > 0) return;

    await this.prisma.externalEnrollment.update({
      where: { guid: request.guid },
      data: { adminNotifiedAt: new Date() },
    });
    const [waiting, admins] = await Promise.all([
      this.prisma.externalEnrollment.count({ where: { infractionId, status: 'WAITING' } }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN', country },
        select: { guid: true, email: true, firstName: true },
      }),
    ]);
    // Sin esperarlo: un correo lento no retiene la respuesta al otro sistema ni las demás solicitudes.
    void this.notify(admins, request, waiting, reason);
  }

  /**
   * El aviso, en la campana y por correo. Uno que no sale no impide nada: queda anotado y la
   * solicitud sigue esperando.
   */
  private async notify(
    admins: Admin[],
    { country, infraction }: ExternalRequest,
    waiting: number,
    reason: WaitingReason,
  ): Promise<void> {
    const people = `${waiting} ${plural(waiting, 'persona', 'personas')}`;
    const label = infractionLabel(infraction);
    const why = WAITING_REASON_TEXT[reason];

    const notices = Promise.allSettled(
      admins.map((admin) =>
        this.notifications.create({
          userGuid: admin.guid,
          country,
          type: 'ENROLLMENT_WAITING',
          title: `Matrículas en espera: infracción ${infraction.code}`,
          message: `${people} ${plural(waiting, 'espera', 'esperan')} matricularse por la infracción ${label}, pero ${why}.`,
          actionUrl: INTEGRATIONS_PAGE,
        }),
      ),
    );
    const mails = settleWithConcurrency(admins, MAIL_CONCURRENCY, (admin) =>
      this.mail.sendEnrollmentWaiting(
        admin.email,
        admin.firstName,
        { infraction: label, people, reason: why, fix: WAITING_REASON_FIX[reason] },
        country,
      ),
    );
    const failed = countRejected(await notices) + countRejected(await mails);
    if (failed > 0) {
      this.logger.error(`No se pudo avisar de la infracción ${infraction.code} en ${failed} caso(s) (${country})`);
    }
  }
}
