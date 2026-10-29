import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { AccessRequestsService } from './access-requests.service';
import { UserService } from './user.service';
import { ProfileService } from './profile.service';
import { Public } from '../common/decorators/public.decorator';
import { BeforeConsent } from '../common/decorators/before-consent.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { receiveFile } from '../storage/multipart';
import { uploadLimit } from '../storage/upload-limits';
import { LoginDto } from './dto/login.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ConfirmCodeDto, RequestCodeDto } from './dto/email-verification.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RejectAccessRequestDto } from './dto/reject-access-request.dto';
import { CREDENTIALS_LIMIT, EMAIL_LIMIT } from '../common/guards/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accessRequests: AccessRequestsService,
    private readonly profile: ProfileService,
    private readonly users: UserService,
  ) {}

  // ── Acceso público ───────────────────────────────────────────────────────

  @Public()
  @Throttle(CREDENTIALS_LIMIT)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.country);
  }

  @Public()
  @Throttle(CREDENTIALS_LIMIT)
  @Post('set-password')
  setInitialPassword(@Body() dto: SetPasswordDto) {
    return this.auth.setInitialPassword(dto.email, dto.temporaryPassword, dto.newPassword);
  }

  @Public()
  @Throttle(EMAIL_LIMIT)
  @Post('access-requests')
  requestAccess(@Body() dto: RequestAccessDto) {
    return this.accessRequests.submit(dto);
  }

  @Public()
  @Throttle(EMAIL_LIMIT)
  @Post('verify-email')
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestVerificationCode(dto.email, dto.country);
  }

  @Public()
  @Throttle(CREDENTIALS_LIMIT)
  @Post('confirm-email')
  confirmCode(@Body() dto: ConfirmCodeDto) {
    return this.auth.confirmEmailVerification(dto.email, dto.code);
  }

  @Public()
  @Throttle(EMAIL_LIMIT)
  @Post('forgot-password')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle(CREDENTIALS_LIMIT)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión actual: revoca el token y libera el registro de sesión activa, de
   * modo que la cuenta queda lista para entrar desde cualquier dispositivo.
   */
  @BeforeConsent()
  @Post('logout')
  async logout(@CurrentUser() user: JwtPayload) {
    await this.auth.logout(user.sub, user.jti);
    return { message: 'Sesión cerrada.' };
  }

  // ── Perfil propio ────────────────────────────────────────────────────────

  @BeforeConsent()
  @Get('me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.profile.get(user.sub, user.country);
  }

  /** Aceptación de la política de tratamiento de datos vigente. */
  @BeforeConsent()
  @Post('me/data-consent')
  acceptDataPolicy(@CurrentUser() user: JwtPayload) {
    return this.profile.acceptDataPolicy(user.sub, user.country);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.sub, dto);
  }

  @Post('me/photo')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async uploadMyPhoto(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest) {
    // El límite de las fotos se aplica al recibir: lo que lo supere no llega a escribirse.
    const file = await receiveFile(req, uploadLimit('avatars'));
    return this.profile.uploadPhoto(user.sub, file.filePath, file.name);
  }

  @Delete('me/photo')
  deleteMyPhoto(@CurrentUser() user: JwtPayload) {
    return this.profile.deletePhoto(user.sub);
  }

  // ── Administración de cuentas ────────────────────────────────────────────

  @Roles('ADMIN')
  @Get('users')
  getUsers(@CurrentUser() user: JwtPayload, @Query() filter: ListAccountsDto) {
    return this.users.getUsers(user.country, filter);
  }

  @Roles('ADMIN')
  @Post('users')
  createUser(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.users.createUser(dto, user.country);
  }

  /** Contraseña temporal nueva para quien aún no ha entrado: la primera pudo no llegarle. */
  @Roles('ADMIN')
  @Throttle(EMAIL_LIMIT)
  @Post('users/:guid/temporary-password')
  resendTemporaryPassword(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.users.resendTemporaryPassword(guid, user.country);
  }

  @Roles('ADMIN')
  @Patch('users/:guid')
  updateUser(@CurrentUser() user: JwtPayload, @Param('guid') guid: string, @Body() dto: UpdateUserDto) {
    return this.users.updateUser(guid, user.country, user.sub, dto);
  }

  /** Cuentas que pueden heredar los cursos de otra antes de eliminarla. */
  @Roles('ADMIN')
  @Get('users/:guid/course-targets')
  getCourseTransferTargets(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.users.getPossibleCourseTransferTargets(user.country, guid);
  }

  @Roles('ADMIN')
  @Delete('users/:guid')
  deleteUser(
    @CurrentUser() user: JwtPayload,
    @Param('guid') guid: string,
    @Query('courseTarget') courseTarget?: string,
  ) {
    return this.users.deleteUser(guid, user.country, user.sub, courseTarget);
  }

  // ── Solicitudes de acceso ────────────────────────────────────────────────

  /** Solicitudes por revisar, para el aviso del menú lateral. */
  @Roles('ADMIN')
  @Get('access-requests/pending-count')
  countPendingRequests(@CurrentUser() user: JwtPayload) {
    return this.accessRequests.countPending(user.country);
  }

  @Roles('ADMIN')
  @Get('access-requests')
  getPendingAccessRequests(@CurrentUser() user: JwtPayload) {
    return this.accessRequests.pending(user.country);
  }

  @Roles('ADMIN')
  @Post('access-requests/:id/approve')
  approveAccessRequest(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.accessRequests.approve(id, user.country);
  }

  @Roles('ADMIN')
  @Post('access-requests/:id/reject')
  rejectAccessRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAccessRequestDto,
  ) {
    return this.accessRequests.reject(id, user.country, dto.reason);
  }
}
