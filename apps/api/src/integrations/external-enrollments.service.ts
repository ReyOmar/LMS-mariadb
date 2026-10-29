import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { Country, countryName } from '../common/domain/country';
import { ExternalEnrollmentDto } from './dto/external-enrollment.dto';
import type { IntegrationCaller } from './integration-auth';
import { ExternalRequest, REQUEST_FIELDS } from './external-request';
import { ExternalEnrollmentView, IntegrationViews } from './integration-views';
import { InfractionsService } from './infractions.service';
import { WaitingRequestsService } from './waiting-requests.service';

/** Motivo con el que queda la solicitud que retira el propio sistema que la envió. */
const WITHDRAWN = 'La retiró el sistema que la envió.';

/**
 * Lo que hace otro sistema, como el del PESV, con su clave: pedir que una persona haga el curso de
 * una infracción —cuando bloquea a un conductor por ella—, consultar si lo terminó y retirar la
 * petición.
 */
@Injectable()
export class ExternalEnrollmentsService {
  private readonly logger = new Logger(ExternalEnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waiting: WaitingRequestsService,
    private readonly infractions: InfractionsService,
    private readonly views: IntegrationViews,
  ) {}

  /**
   * Recibe una solicitud y la atiende en el acto si el curso ya la admite.
   *
   * Es idempotente: repetirla con el mismo `externalId` —un reintento tras un corte— devuelve la
   * que ya existe en lugar de crear otra. Reutilizar el identificador para otra persona u otra
   * infracción es un error del otro sistema y se rechaza.
   */
  async receive(
    dto: ExternalEnrollmentDto,
    caller: IntegrationCaller,
  ): Promise<{ created: boolean; view: ExternalEnrollmentView }> {
    if (dto.country !== caller.country) {
      throw new ForbiddenException(
        `La clave es de la sede de ${countryName(caller.country)} y la solicitud, de la de ${countryName(dto.country)}: usa la clave de esa sede.`,
      );
    }
    const existing = await this.findOwn(caller, dto.externalId);
    if (existing) {
      ensureSameRequest(existing, dto);
      return { created: false, view: await this.views.request(existing) };
    }

    await this.ensureEnrollable(dto.email, caller.country);
    const { externalId, infractionCode, infractionDescription, email, firstName, lastName } = dto;
    const infractionId = await this.infractions.register(caller.country, infractionCode, infractionDescription ?? null);

    let request: Pick<ExternalRequest, 'guid' | 'externalId' | 'country'>;
    try {
      request = await this.prisma.externalEnrollment.create({
        data: { clientId: caller.id, country: caller.country, externalId, infractionId, email, firstName, lastName },
        select: { guid: true, externalId: true, country: true },
      });
    } catch (error) {
      // Dos envíos simultáneos de la misma solicitud: el segundo encuentra la del primero.
      if (isUniqueViolation(error)) return this.receive(dto, caller);
      throw error;
    }
    this.logger.log(`Solicitud ${externalId} de «${caller.name}»: ${email} por la infracción ${infractionCode}`);

    await this.waiting.attendNew(request);
    const view = await this.views.request(await this.load(request.guid));
    // Lo que se le responde ya lo sabe: sólo se le avisará si después cambia.
    await this.prisma.externalEnrollment.update({
      where: { guid: request.guid },
      data: { notifiedStatus: view.status },
    });
    return { created: true, view };
  }

  /** En qué punto está una solicitud del sistema que la consulta. */
  async status(externalId: string, caller: IntegrationCaller): Promise<ExternalEnrollmentView> {
    return this.views.request(await this.findOwnOrFail(caller, externalId));
  }

  /**
   * Retira una solicitud que ya no hace falta, como la de una infracción anulada. Sólo mientras
   * espera: una ya retirada o descartada se devuelve tal cual, y una ya atendida no se retira
   * porque la matrícula sigue su curso.
   */
  async withdraw(externalId: string, caller: IntegrationCaller): Promise<ExternalEnrollmentView> {
    const request = await this.findOwnOrFail(caller, externalId);
    if (request.status !== 'REJECTED' && !(await this.waiting.close(request, WITHDRAWN))) {
      throw new ConflictException(
        'La solicitud ya se atendió y no se puede retirar: la persona está matriculada o ya terminó el curso.',
      );
    }
    return this.views.request(await this.load(request.guid));
  }

  private findOwn(caller: IntegrationCaller, externalId: string) {
    return this.prisma.externalEnrollment.findUnique({
      where: { clientId_externalId: { clientId: caller.id, externalId } },
      select: REQUEST_FIELDS,
    });
  }

  private async findOwnOrFail(caller: IntegrationCaller, externalId: string): Promise<ExternalRequest> {
    const request = await this.findOwn(caller, externalId);
    if (!request) throw new NotFoundException(`No hay ninguna solicitud con el identificador ${externalId}.`);
    return request;
  }

  private load(guid: string): Promise<ExternalRequest> {
    return this.prisma.externalEnrollment.findUniqueOrThrow({ where: { guid }, select: REQUEST_FIELDS });
  }

  /** Un correo que ya es de otra sede, de un examinador o de un administrador no puede matricularse aquí. */
  private async ensureEnrollable(email: string, country: Country): Promise<void> {
    const account = await this.prisma.user.findUnique({ where: { email }, select: { role: true, country: true } });
    if (account && (account.role !== 'STUDENT' || account.country !== country)) {
      throw new ConflictException('El correo pertenece a una cuenta que no puede matricularse en esta sede.');
    }
  }
}

/** Repetir un `externalId` sólo vale para la misma persona y la misma infracción. */
function ensureSameRequest(existing: ExternalRequest, dto: ExternalEnrollmentDto): void {
  if (existing.email !== dto.email || existing.infraction.code !== dto.infractionCode) {
    throw new ConflictException(
      `El identificador ${dto.externalId} ya se usó para otra solicitud (${existing.email}, infracción ${existing.infraction.code}). Cada solicitud necesita el suyo.`,
    );
  }
}
