import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { EnviarMensajeDto, ResponderContactoDto, SolicitarContactoDto } from './dto/mensajes.dto';

/**
 * Avisos y mensajería. Todo opera sobre el usuario en sesión; ninguna ruta acepta un
 * identificador de usuario por parámetro para decidir de quién son los datos.
 */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly notificaciones: NotificacionesService,
    private readonly chat: ChatService,
  ) {}

  // ── Notificaciones ───────────────────────────────────────────────────────

  @Get()
  getNotificaciones(@CurrentUser() user: JwtPayload, @Query('limit') limite?: string) {
    return this.notificaciones.getDelUsuario(user, limite ? Number(limite) : undefined);
  }

  @Get('/no-leidas')
  contarNoLeidas(@CurrentUser() user: JwtPayload) {
    return this.notificaciones.contarNoLeidas(user);
  }

  @Patch('/leer-todas')
  marcarTodasLeidas(@CurrentUser() user: JwtPayload) {
    return this.notificaciones.marcarTodasLeidas(user);
  }

  @Patch('/:id/leer')
  marcarLeida(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.notificaciones.marcarLeida(id, user);
  }

  @Delete()
  limpiar(@CurrentUser() user: JwtPayload) {
    return this.notificaciones.limpiar(user);
  }

  // ── Mensajería ───────────────────────────────────────────────────────────

  @Post('/mensajes')
  enviarMensaje(@CurrentUser() user: JwtPayload, @Body() dto: EnviarMensajeDto) {
    return this.chat.enviarMensaje(dto, user);
  }

  @Get('/mensajes/contactos')
  getContactos(@CurrentUser() user: JwtPayload) {
    return this.chat.getContactos(user);
  }

  @Get('/mensajes/buscar')
  buscarContactos(@CurrentUser() user: JwtPayload, @Query('q') busqueda = '') {
    return this.chat.buscarPosiblesContactos(busqueda, user);
  }

  @Get('/mensajes/solicitudes')
  getSolicitudes(@CurrentUser() user: JwtPayload) {
    return this.chat.getSolicitudesPendientes(user);
  }

  @Post('/mensajes/solicitudes')
  solicitarContacto(@CurrentUser() user: JwtPayload, @Body() dto: SolicitarContactoDto) {
    return this.chat.solicitarContacto(dto.receptor_guid, dto.curso_guid, user);
  }

  @Patch('/mensajes/solicitudes/:id')
  responderSolicitud(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResponderContactoDto,
  ) {
    return this.chat.responderSolicitud(id, dto.aceptar, user);
  }

  @Get('/mensajes/:contacto_guid')
  getConversacion(@CurrentUser() user: JwtPayload, @Param('contacto_guid') contactoGuid: string) {
    return this.chat.getConversacion(contactoGuid, user);
  }

  @Patch('/mensajes/:contacto_guid/leer')
  marcarConversacionLeida(@CurrentUser() user: JwtPayload, @Param('contacto_guid') contactoGuid: string) {
    return this.chat.marcarConversacionLeida(contactoGuid, user);
  }

  @Delete('/mensajes/:contacto_guid')
  eliminarConversacion(@CurrentUser() user: JwtPayload, @Param('contacto_guid') contactoGuid: string) {
    return this.chat.eliminarConversacion(contactoGuid, user);
  }
}
