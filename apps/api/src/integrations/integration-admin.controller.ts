import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { IntegrationClientsService } from './integration-clients.service';
import { WaitingRequestsService } from './waiting-requests.service';
import { InfractionsService } from './infractions.service';
import { IntegrationWebhooks } from './integration-webhooks';
import { CallbackUrlDto, CreateIntegrationClientDto, InfractionCourseDto } from './dto/integration-admin.dto';

/**
 * Lo que gestiona el administrador de la sede: los sistemas conectados, a dónde se les avisa, las
 * infracciones y su curso.
 */
@Roles('ADMIN')
@Controller('integration')
export class IntegrationAdminController {
  constructor(
    private readonly clients: IntegrationClientsService,
    private readonly infractions: InfractionsService,
    private readonly waitingRequests: WaitingRequestsService,
    private readonly webhooks: IntegrationWebhooks,
  ) {}

  @Get('clients')
  listClients(@CurrentUser() user: JwtPayload) {
    return this.clients.list(user.country);
  }

  /** La clave sólo viaja en esta respuesta: el panel la enseña una vez. */
  @Post('clients')
  createClient(@CurrentUser() user: JwtPayload, @Body() dto: CreateIntegrationClientDto) {
    return this.clients.create(dto.name, user.country);
  }

  @Post('clients/:id/key')
  renewKey(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.clients.renewKey(id, user.country);
  }

  @Delete('clients/:id/key')
  revokeKey(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.clients.revokeKey(id, user.country);
  }

  /** Dirección a la que avisar al sistema de los cambios en sus solicitudes; `null` la quita. */
  @Put('clients/:id/callback')
  setCallback(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: CallbackUrlDto) {
    return this.clients.setCallback(id, dto.url, user.country);
  }

  /** Un aviso de prueba a esa dirección. Si no llega, lo dice la respuesta: no es un error del campus. */
  @Post('clients/:id/callback/test')
  testCallback(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.webhooks.ping(id, user.country);
  }

  /** Sólo un sistema desconectado: borra también el registro de sus solicitudes. */
  @Delete('clients/:id')
  removeClient(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.clients.remove(id, user.country);
  }

  /** Las infracciones que han llegado a la sede, su curso y quién espera por ellas. */
  @Get('infractions')
  listInfractions(@CurrentUser() user: JwtPayload) {
    return this.infractions.list(user.country);
  }

  /** Elige el curso de una infracción: quienes esperaban por ella se matriculan en el acto. */
  @Put('infractions/:id/course')
  assignCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InfractionCourseDto,
  ) {
    return this.infractions.assignCourse(id, dto.courseGuid, user.country);
  }

  @Delete('requests/:guid')
  discard(@CurrentUser() user: JwtPayload, @Param('guid', ParseUUIDPipe) guid: string) {
    return this.waitingRequests.discard(guid, user.country);
  }
}
