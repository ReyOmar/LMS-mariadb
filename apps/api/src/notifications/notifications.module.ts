import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ChatService } from './chat.service';
import { ChatContactsService } from './chat-contacts.service';
import { ChatAccess } from './chat-access';

/** Global: casi todos los módulos de dominio crean avisos para el usuario. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ChatService, ChatContactsService, ChatAccess],
  exports: [NotificationsService],
})
export class NotificationsModule {}
