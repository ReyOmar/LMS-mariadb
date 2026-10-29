import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MAIL_CONCURRENCY } from '../mail/mail-transport';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { Country, countryName } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { generateTemporaryPassword, hashPassword } from '../common/domain/password';
import { RequestAccessDto } from './dto/request-access.dto';

const REQUEST_ALREADY_RESOLVED = 'Esta solicitud ya fue procesada.';

const REQUEST_PENDING = 'Ya tienes una solicitud pendiente de revisión con este correo.';

/**
 * Solicitudes de acceso: quien no tiene cuenta la pide a una sede con su correo verificado, y
 * un administrador de esa sede la aprueba —se crea la cuenta con una clave temporal— o la
 * rechaza con un motivo. La decisión se le comunica por correo.
 */
@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Registra una solicitud de acceso a una sede.
   * Exige que el correo haya sido verificado antes y consume esa verificación, para que un
   * mismo código no sirva para solicitudes repetidas. Sólo después, con el buzón ya probado,
   * se dice si el correo tiene cuenta: antes serviría para averiguar quién está registrado.
   */
  async submit(dto: RequestAccessDto) {
    const verification = await this.prisma.emailVerification.findFirst({
      where: { email: dto.email, verified: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('Verifica tu correo electrónico antes de enviar la solicitud.');
    }

    const alreadyExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { guid: true },
    });
    if (alreadyExists) {
      throw new BadRequestException('Este correo ya tiene una cuenta. Inicia sesión directamente.');
    }

    const existing = await this.prisma.accessRequest.findUnique({ where: { email: dto.email } });
    if (existing?.status === 'PENDING') {
      throw new BadRequestException(REQUEST_PENDING);
    }

    const consentVersion = await this.settings.legalVersion(dto.country);

    const accessRequest = await this.prisma.$transaction(async (tx) => {
      // La verificación se consume aquí para que no pueda reutilizarse.
      await tx.emailVerification.deleteMany({ where: { email: dto.email } });

      const data = {
        // La búsqueda no distingue tildes: una solicitud antigua de `juan@empresá.com`
        // vuelve como la de `juan@empresa.com`. Se reescribe el correo para que la clave
        // temporal de la aprobación vaya al buzón verificado, no al de la solicitud antigua.
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        requestedRole: dto.requestedRole,
        country: dto.country,
        status: 'PENDING' as const,
        rejectionReason: null,
        consentAt: new Date(),
        consentVersion,
      };

      // Volver a pedir acceso tras un rechazo es una solicitud nueva: se fecha y se ordena como tal.
      return existing
        ? tx.accessRequest.update({ where: { id: existing.id }, data: { ...data, createdAt: new Date() } })
        : tx.accessRequest.create({ data });
    });

    this.realtime.emitToRole('request:new', { id: accessRequest.id }, dto.country, 'ADMIN');
    void this.notifyAdmins(dto);

    return {
      message: `Solicitud enviada a los administradores de ${countryName(dto.country)}. Recibirás un correo cuando sea revisada.`,
      requestId: accessRequest.id,
    };
  }

  /** Avisa por correo a los administradores de la sede. Los fallos se registran, no se propagan. */
  private async notifyAdmins(dto: RequestAccessDto): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', country: dto.country },
        select: { email: true, firstName: true },
      });
      const results = await settleWithConcurrency(admins, MAIL_CONCURRENCY, (admin) =>
        this.mail.sendAccessRequest(admin.email, admin.firstName, {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          requestedRole: dto.requestedRole,
          country: dto.country,
        }),
      );
      const failed = countRejected(results);
      if (failed > 0) this.logger.error(`No se pudo avisar a ${failed} administrador(es) de ${dto.country}`);
    } catch (error) {
      this.logger.error(`No se pudo avisar a los administradores de ${dto.country}`, error);
    }
  }

  /** Solicitudes pendientes de la sede del administrador que consulta. */
  pending(country: Country) {
    return this.prisma.accessRequest.findMany({
      where: { status: 'PENDING', country },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Solicitudes de la sede que esperan revisión, para el aviso del menú lateral. */
  async countPending(country: Country) {
    const count = await this.prisma.accessRequest.count({ where: { status: 'PENDING', country } });
    return { count };
  }

  /**
   * Aprueba una solicitud y crea la cuenta con una clave temporal.
   * La cuenta hereda el país de la solicitud, nunca el del administrador: así una
   * solicitud sólo puede acabar en la sede a la que se dirigió.
   *
   * Si la persona ya tiene cuenta, la solicitud se da por atendida sin crear otra ni escribirle.
   */
  async approve(id: number, country: Country) {
    const accessRequest = await this.findPending(id, country);

    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      await this.resolve(tx, id, { status: 'ACCEPTED', rejectionReason: null });

      // Comprobación dentro de la transacción: entre la solicitud y la aprobación
      // pudo crearse la cuenta por otra vía.
      const duplicate = await tx.user.findUnique({ where: { email: accessRequest.email }, select: { guid: true } });
      if (duplicate) return null;

      return tx.user.create({
        data: {
          email: accessRequest.email,
          firstName: accessRequest.firstName,
          lastName: accessRequest.lastName,
          role: accessRequest.requestedRole,
          country: accessRequest.country,
          password: hash,
          usesDefaultPassword: true,
          dataConsentAt: accessRequest.consentAt,
          dataConsentVersion: accessRequest.consentVersion,
        },
      });
    });

    this.realtime.emitToRole('request:resolved', { id, action: 'approved' }, country, 'ADMIN');
    if (!user) return { message: 'Esta persona ya tenía cuenta: la solicitud queda atendida sin enviarle nada.' };
    this.realtime.emitToRole('user:created', { guid: user.guid }, country, 'ADMIN');

    this.mail
      .sendWelcome(accessRequest.email, accessRequest.firstName, temporaryPassword, accessRequest.country)
      .catch((error) => this.logger.error('No se pudo enviar el correo de bienvenida', error));

    return { message: 'Solicitud aprobada. La persona recibirá por correo una contraseña temporal propia.' };
  }

  /**
   * Rechaza una solicitud conservando el registro, para que quede constancia de quién fue
   * rechazado y por qué, y se lo comunica por correo a quien la envió.
   */
  async reject(id: number, country: Country, reason?: string | null) {
    const accessRequest = await this.findPending(id, country);
    const rejectionReason = reason?.trim() || null;

    await this.resolve(this.prisma, id, { status: 'REJECTED', rejectionReason });

    this.realtime.emitToRole('request:resolved', { id, action: 'rejected' }, country, 'ADMIN');

    this.mail
      .sendAccessRequestRejected(accessRequest.email, accessRequest.firstName, rejectionReason, accessRequest.country)
      .catch((error) => this.logger.error('No se pudo enviar el aviso de solicitud rechazada', error));

    return { message: 'Solicitud rechazada. La persona recibirá un correo con la decisión.' };
  }

  /** Carga una solicitud comprobando que es de la sede del administrador y sigue pendiente. */
  private async findPending(id: number, country: Country) {
    const accessRequest = await this.prisma.accessRequest.findFirst({ where: { id, country } });
    if (!accessRequest) throw new NotFoundException('Solicitud no encontrada.');
    if (accessRequest.status !== 'PENDING') throw new BadRequestException(REQUEST_ALREADY_RESOLVED);
    return accessRequest;
  }

  /**
   * Anota la decisión sólo si la solicitud sigue pendiente. Si dos administradores la
   * resuelven a la vez, la segunda decisión no se aplica: ni se crea una cuenta que otro
   * acaba de rechazar ni la persona recibe dos correos con decisiones opuestas.
   */
  private async resolve(
    db: Prisma.TransactionClient,
    id: number,
    decision: { status: 'ACCEPTED' | 'REJECTED'; rejectionReason: string | null },
  ): Promise<void> {
    const { count } = await db.accessRequest.updateMany({ where: { id, status: 'PENDING' }, data: decision });
    if (count === 0) throw new BadRequestException(REQUEST_ALREADY_RESOLVED);
  }
}
