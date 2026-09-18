import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { MailService } from './mail.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateTemplateDto } from './dto/update-template.dto';

/**
 * Plantillas de correo.
 *
 * Son comunes a las dos sedes: la marca (logotipo, color, nombre) se aplica al enviar
 * según el país del destinatario, de modo que un solo texto sirve para ambas. Editarlas
 * queda reservado al administrador.
 */
@Roles('ADMINISTRADOR')
@Controller('mail-templates')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get('/eventos')
  getEventos() {
    return this.mail.getEventos();
  }

  @Put('/:id')
  actualizarPlantilla(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.mail.actualizarPlantilla(id, dto);
  }
}
