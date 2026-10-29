import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ChatService } from './chat.service';
import { ChatContactsService } from './chat-contacts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  ContactSearchDto,
  NotificationsQueryDto,
  RequestContactDto,
  RespondToContactDto,
  SendMessageDto,
} from './dto/messages.dto';

/**
 * Avisos y mensajería. Todo opera sobre el usuario en sesión; ninguna ruta acepta un
 * identificador de usuario por parámetro para decidir de quién son los datos.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly chat: ChatService,
    private readonly contacts: ChatContactsService,
  ) {}

  // ── Notificaciones ───────────────────────────────────────────────────────

  @Get()
  getNotifications(@CurrentUser() user: JwtPayload, @Query() query: NotificationsQueryDto) {
    return this.notifications.getUserNotifications(user, query.limit);
  }

  @Get('/unread')
  countUnread(@CurrentUser() user: JwtPayload) {
    return this.notifications.countUnread(user);
  }

  @Patch('/read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user);
  }

  @Delete()
  clear(@CurrentUser() user: JwtPayload) {
    return this.notifications.clear(user);
  }

  // ── Mensajería ───────────────────────────────────────────────────────────

  @Post('/messages')
  sendMessage(@CurrentUser() user: JwtPayload, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(dto, user);
  }

  @Get('/messages/contacts')
  getConversations(@CurrentUser() user: JwtPayload) {
    return this.chat.getConversations(user);
  }

  @Get('/messages/search')
  searchContacts(@CurrentUser() user: JwtPayload, @Query() query: ContactSearchDto) {
    return this.contacts.searchCandidates(query.q ?? '', user);
  }

  @Get('/messages/requests')
  getRequests(@CurrentUser() user: JwtPayload) {
    return this.contacts.pending(user);
  }

  @Post('/messages/requests')
  requestContact(@CurrentUser() user: JwtPayload, @Body() dto: RequestContactDto) {
    return this.contacts.request(dto.receiverGuid, dto.courseGuid, user);
  }

  @Patch('/messages/requests/:id')
  respondToRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondToContactDto,
  ) {
    return this.contacts.respond(id, dto.accept, user);
  }

  @Get('/messages/:contactGuid')
  getConversation(@CurrentUser() user: JwtPayload, @Param('contactGuid') contactGuid: string) {
    return this.chat.getConversation(contactGuid, user);
  }

  @Patch('/messages/:contactGuid/read')
  markConversationRead(@CurrentUser() user: JwtPayload, @Param('contactGuid') contactGuid: string) {
    return this.chat.markConversationRead(contactGuid, user);
  }

  @Delete('/messages/:contactGuid')
  deleteConversation(@CurrentUser() user: JwtPayload, @Param('contactGuid') contactGuid: string) {
    return this.chat.deleteConversation(contactGuid, user);
  }
}
