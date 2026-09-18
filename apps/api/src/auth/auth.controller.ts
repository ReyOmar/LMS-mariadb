import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload, RolUsuario } from '../common/interfaces/jwt-payload.interface';
import { leerArchivoDeLaPeticion } from '../storage/multipart';
import { LoginDto } from './dto/login.dto';
import { SolicitarAccesoDto } from './dto/solicitar-acceso.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ConfirmarCodigoDto, SolicitarCodigoDto } from './dto/verificacion-email.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { RechazarSolicitudDto } from './dto/rechazar-solicitud.dto';

/** Límite estricto para los flujos que pueden usarse para adivinar credenciales. */
const LIMITE_CREDENCIALES = { default: { ttl: 60_000, limit: 5 } };

/** Límite para los flujos que disparan el envío de un correo. */
const LIMITE_CORREO = { default: { ttl: 60_000, limit: 3 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) {}

  // ── Acceso público ───────────────────────────────────────────────────────

  @Public()
  @Throttle(LIMITE_CREDENCIALES)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.contrasena, dto.pais);
  }

  @Public()
  @Throttle(LIMITE_CREDENCIALES)
  @Post('establecer-password')
  setupPassword(@Body() dto: SetupPasswordDto) {
    return this.auth.setupPassword(dto.email, dto.contrasenaTemporal, dto.nuevaContrasena);
  }

  @Public()
  @Throttle(LIMITE_CORREO)
  @Post('solicitar')
  requestAccess(@Body() dto: SolicitarAccesoDto) {
    return this.auth.requestAccess(dto);
  }

  @Public()
  @Throttle(LIMITE_CORREO)
  @Post('verificar-email')
  sendVerification(@Body() dto: SolicitarCodigoDto) {
    return this.auth.sendEmailVerification(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('confirmar-email')
  confirmVerification(@Body() dto: ConfirmarCodigoDto) {
    return this.auth.confirmEmailVerification(dto.email, dto.codigo);
  }

  @Public()
  @Throttle(LIMITE_CORREO)
  @Post('recuperar-contrasena')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle(LIMITE_CREDENCIALES)
  @Post('restablecer-contrasena')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.nuevaContrasena);
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión actual: revoca el token y libera el registro de sesión activa, de
   * modo que la cuenta queda lista para entrar desde cualquier dispositivo.
   */
  @Post('logout')
  async logout(@CurrentUser() user: JwtPayload) {
    await this.users.cerrarSesion(user.sub, user.jti);
    return { message: 'Sesión cerrada.' };
  }

  // ── Perfil propio ────────────────────────────────────────────────────────

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.users.getUserProfile(user.sub, user.pais);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Post('me/foto')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async uploadMyPhoto(@CurrentUser() user: JwtPayload, @Req() req: unknown) {
    const archivo = await leerArchivoDeLaPeticion(req);
    return this.users.uploadProfilePhoto(user.sub, archivo.contenido, archivo.nombre);
  }

  @Delete('me/foto')
  deleteMyPhoto(@CurrentUser() user: JwtPayload) {
    return this.users.deleteProfilePhoto(user.sub);
  }

  /**
   * Perfil de otro usuario de la misma sede.
   * Sólo el propio interesado o un administrador pueden consultarlo.
   */
  @Get('perfil/:guid')
  getProfile(@Param('guid') guid: string, @CurrentUser() user: JwtPayload) {
    if (user.sub !== guid && user.role !== 'ADMINISTRADOR') {
      throw new ForbiddenException('No tienes permiso para ver este perfil.');
    }
    return this.users.getUserProfile(guid, user.pais);
  }

  // ── Administración de cuentas ────────────────────────────────────────────

  @Roles('ADMINISTRADOR')
  @Get('usuarios')
  getAllUsers(@CurrentUser() user: JwtPayload) {
    return this.users.getAllUsers(user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Get('usuarios/por-rol')
  getUsuariosPorRol(@CurrentUser() user: JwtPayload, @Query('rol') rol: string) {
    const roles: RolUsuario[] = ['ADMINISTRADOR', 'PROFESOR', 'ESTUDIANTE'];
    if (!roles.includes(rol as RolUsuario)) {
      throw new BadRequestException(`El rol debe ser uno de: ${roles.join(', ')}.`);
    }
    return this.users.getUsuariosPorRol(user.pais, rol as RolUsuario);
  }

  @Roles('ADMINISTRADOR')
  @Get('admin-stats')
  getAdminStats(@CurrentUser() user: JwtPayload) {
    return this.users.getAdminStats(user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Post('usuarios')
  createUser(@CurrentUser() user: JwtPayload, @Body() dto: CrearUsuarioDto) {
    return this.users.createUser(dto, user.pais);
  }

  /** Cuentas que pueden heredar los cursos de otra antes de eliminarla. */
  @Roles('ADMINISTRADOR')
  @Get('usuarios/:guid/destinos-cursos')
  getDestinosDeCursos(@CurrentUser() user: JwtPayload, @Param('guid') guid: string) {
    return this.users.getPosiblesDestinosDeCursos(user.pais, guid);
  }

  @Roles('ADMINISTRADOR')
  @Patch('usuarios/:guid/activo')
  setUserActive(
    @CurrentUser() user: JwtPayload,
    @Param('guid') guid: string,
    @Body('activo') activo: boolean,
  ) {
    if (typeof activo !== 'boolean') {
      throw new BadRequestException('Indica si la cuenta debe quedar activa (true) o desactivada (false).');
    }
    return this.users.setUserActive(guid, activo, user.pais, user.sub);
  }

  @Roles('ADMINISTRADOR')
  @Delete('usuarios/:guid')
  deleteUser(
    @CurrentUser() user: JwtPayload,
    @Param('guid') guid: string,
    @Query('destino_cursos') destinoCursos?: string,
  ) {
    return this.users.deleteUser(guid, user.pais, user.sub, destinoCursos);
  }

  // ── Solicitudes de acceso ────────────────────────────────────────────────

  @Roles('ADMINISTRADOR')
  @Get('solicitudes')
  getPendingRequests(@CurrentUser() user: JwtPayload) {
    return this.auth.getPendingRequests(user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Post('solicitudes/:id/aprobar')
  approveRequest(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.auth.approveRequest(id, user.pais);
  }

  @Roles('ADMINISTRADOR')
  @Post('solicitudes/:id/rechazar')
  rejectRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarSolicitudDto,
  ) {
    return this.auth.rejectRequest(id, user.pais, dto.motivo);
  }
}
