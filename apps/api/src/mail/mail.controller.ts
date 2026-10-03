import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { MailService } from './mail.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UpdateTemplateDto } from './dto/update-template.dto';

/**
 * Plantillas de correo.
 *
 * Cada sede tiene las suyas: el administrador sólo ve y edita las de su sede, que es la
 * de su sesión. Editarlas queda reservado al administrador.
 */
@Roles('ADMIN')
@Controller('email-templates')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('/events')
  getEvents(@CurrentUser() user: JwtPayload) {
    return this.mail.getEvents(user.country);
  }

  @Put('/:id')
  updateTemplate(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.mail.updateTemplate(id, user.country, dto);
  }
}
