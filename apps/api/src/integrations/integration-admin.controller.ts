import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { IntegrationClientsService } from './integration-clients.service';
import { ExternalEnrollmentsService } from './external-enrollments.service';
import { CreateIntegrationClientDto } from './dto/integration-client.dto';

/** Lo que gestiona el administrador de la sede: los sistemas conectados y lo que espera un curso. */
@Roles('ADMIN')
@Controller('integration')
export class IntegrationAdminController {
  constructor(
    private readonly clients: IntegrationClientsService,
    private readonly requests: ExternalEnrollmentsService,
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

  @Get('waiting')
  waiting(@CurrentUser() user: JwtPayload) {
    return this.requests.waitingByCourse(user.country);
  }

  @Delete('requests/:guid')
  discard(@CurrentUser() user: JwtPayload, @Param('guid', ParseUUIDPipe) guid: string) {
    return this.requests.discard(guid, user.country);
  }
}
