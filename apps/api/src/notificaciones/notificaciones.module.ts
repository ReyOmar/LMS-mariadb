import { Global, Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { ChatService } from './chat.service';

/** Global: casi todos los módulos de dominio crean avisos para el usuario. */
@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, ChatService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
