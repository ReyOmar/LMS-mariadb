import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Caller, IntegrationAuth, type IntegrationCaller } from './integration-auth';
import { ExternalEnrollmentsService } from './external-enrollments.service';
import { ExternalEnrollmentDto } from './dto/external-enrollment.dto';

/**
 * API para otros sistemas, versión 1. Es un contrato con terceros (`docs/INTEGRACION.md` y
 * `docs/integracion-openapi.yaml`): lo que cambie de forma incompatible va en una versión nueva.
 */
@IntegrationAuth()
@Controller('integration/v1')
export class IntegrationApiController {
  constructor(private readonly requests: ExternalEnrollmentsService) {}

  /** 201 si la solicitud es nueva; 200 si ya existía con ese identificador (un reintento). */
  @Post('enrollment-requests')
  async request(
    @Caller() caller: IntegrationCaller,
    @Body() dto: ExternalEnrollmentDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { created, view } = await this.requests.receive(dto, caller);
    reply.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return view;
  }

  @Get('enrollment-requests/:externalId')
  status(@Caller() caller: IntegrationCaller, @Param('externalId') externalId: string) {
    return this.requests.status(externalId, caller);
  }

  /** Retira una solicitud que ya no hace falta, mientras espera. */
  @Delete('enrollment-requests/:externalId')
  withdraw(@Caller() caller: IntegrationCaller, @Param('externalId') externalId: string) {
    return this.requests.withdraw(externalId, caller);
  }
}
