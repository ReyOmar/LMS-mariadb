import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { receiveFile } from '../storage/multipart';
import { LoginDto } from './dto/login.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ConfirmCodeDto, RequestCodeDto } from './dto/email-verification.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RejectAccessRequestDto } from './dto/reject-access-request.dto';

/** Límite estricto para los flujos que pueden usarse para adivinar credenciales. */
const CREDENTIALS_RATE_LIMIT = { default: { ttl: 60_000, limit: 5 } };

/** Límite para los flujos que disparan el envío de un correo. */
const EMAIL_RATE_LIMIT = { default: { ttl: 60_000, limit: 3 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) {}

  // ── Acceso público ───────────────────────────────────────────────────────

  @Public()
  @Throttle(CREDENTIALS_RATE_LIMIT)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.country);
  }

  @Public()
  @Throttle(CREDENTIALS_RATE_LIMIT)
  @Post('set-password')
  setInitialPassword(@Body() dto: SetPasswordDto) {
    return this.auth.setInitialPassword(dto.email, dto.temporaryPassword, dto.newPassword);
  }

  @Public()
  @Throttle(EMAIL_RATE_LIMIT)
  @Post('access-requests')
  requestAccess(@Body() dto: RequestAccessDto) {
    return this.auth.requestAccess(dto);
  }

  @Public()
  @Throttle(EMAIL_RATE_LIMIT)
  @Post('verify-email')
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestVerificationCode(dto.email, dto.country);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('confirm-email')
  confirmCode(@Body() dto: ConfirmCodeDto) {
    return this.auth.confirmEmailVerification(dto.email, dto.code);
  }

  @Public()
  @Throttle(EMAIL_RATE_LIMIT)
  @Post('forgot-password')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle(CREDENTIALS_RATE_LIMIT)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión actual: revoca el token y libera el registro de sesión activa, de
   * modo que la cuenta queda lista para entrar desde cualquier dispositivo.
   */
  @Post('logout')
  async logout(@CurrentUser() user: JwtPayload) {
    await this.users.logout(user.sub, user.jti);
    return { message: 'Sesión cerrada.' };
  }

  // ── Perfil propio ────────────────────────────────────────────────────────

  @Get('me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.users.getUserProfile(user.sub, user.country);
  }

  /** Aceptación de la política de tratamiento de datos vigente. */
  @Post('me/data-consent')
  acceptDataPolicy(@CurrentUser() user: JwtPayload) {
    return this.users.acceptDataPolicy(user.sub, user.country);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Post('me/photo')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async uploadMyPhoto(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest) {
    const file = await receiveFile(req);
    return this.users.uploadProfilePhoto(user.sub, file.filePath, file.name);
  }

  @Delete('me/photo')
  deleteMyPhoto(@CurrentUser() user: JwtPayload) {
    return this.users.deleteProfilePhoto(user.sub);
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

  @Roles('ADMIN')
  /** Solicitudes por revisar, para el aviso del menú lateral. */
  @Roles('ADMIN')
  @Get('access-requests/pending-count')
  countPendingRequests(@CurrentUser() user: JwtPayload) {
    return this.users.countPendingRequests(user.country);
  }

  @Roles('ADMIN')
  @Get('access-requests')
  getPendingAccessRequests(@CurrentUser() user: JwtPayload) {
    return this.auth.getPendingAccessRequests(user.country);
  }

  @Roles('ADMIN')
  @Post('access-requests/:id/approve')
  approveAccessRequest(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.auth.approveAccessRequest(id, user.country);
  }

  @Roles('ADMIN')
  @Post('access-requests/:id/reject')
  rejectAccessRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAccessRequestDto,
  ) {
    return this.auth.rejectAccessRequest(id, user.country, dto.reason);
  }
}
