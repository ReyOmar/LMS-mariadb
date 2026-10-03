import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_CONCURRENCY, MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { Country, countryName } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { plural } from '../common/domain/text';
import {
  generateTemporaryPassword,
  hashPassword,
  passwordMatches,
  simulatePasswordCheck,
  validateStrength,
} from '../common/domain/password';
import { JwtClaims, UserRole } from '../common/interfaces/jwt-payload.interface';
import { RequestAccessDto } from './dto/request-access.dto';

/** Vigencia del enlace de recuperación de contraseña. */
const RESET_VALIDITY_MS = 60 * 60 * 1000;

/** Vigencia del código de verificación de correo. */
const CODE_VALIDITY_MS = 10 * 60 * 1000;

/** Espera mínima entre dos envíos de código al mismo correo. */
const RESEND_DELAY_MS = 60 * 1000;

/** Fallos tolerados antes de invalidar un código de verificación. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Respuesta neutra de recuperación de contraseña.
 * Se devuelve exista o no la cuenta, para no revelar qué correos están registrados.
 */
const PASSWORD_RESET_RESPONSE = {
  message: 'Si el correo está registrado, recibirás un enlace de recuperación en unos minutos.',
};

/** El único mensaje con el que se rechaza un acceso: no dice cuál de los datos falló. */
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';

/**
 * El único mensaje con el que se rechaza el primer acceso. Cubre a la vez la cuenta que no
 * existe, la que ya tiene contraseña propia y la clave temporal mal escrita, porque esta
 * ruta es pública y no puede servir para averiguar qué correos están registrados.
 */
const INVALID_TEMPORARY_PASSWORD =
  'No se pudo verificar la contraseña temporal. Si ya creaste la tuya, entra con ella o usa «¿Olvidaste tu contraseña?».';

/**
 * Flujos de autenticación: entrada, alta de cuenta y recuperación de contraseña.
 * La gestión de cuentas ya creadas (perfil, listado, borrado) vive en `UserService`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
  ) {}

  // ── Entrada ──────────────────────────────────────────────────────────────

  /**
   * Autentica a un usuario en una sede concreta.
   *
   * Todos los caminos de fallo devuelven el mismo mensaje: correo inexistente, contraseña
   * incorrecta y sede equivocada son indistinguibles desde fuera. Revelar cuál de los tres
   * falló permitiría enumerar las cuentas del sistema y averiguar en qué sede está cada
   * persona. La única excepción es la solicitud pendiente de aprobación, que el propio
   * solicitante necesita poder consultar.
   */
  async login(email: string, password: string, country: Country) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Sin cuenta, o con una cuenta sin contraseña —que sólo puede recuperarse probando que
    // el correo es suyo—, se dedica el mismo tiempo que a una comprobación real: si no, la
    // rapidez de la respuesta delataría qué correos están registrados.
    if (!user?.password) {
      await simulatePasswordCheck(password);

      if (!user) {
        const accessRequest = await this.prisma.accessRequest.findUnique({ where: { email } });
        if (accessRequest?.status === 'PENDING') {
          throw new UnauthorizedException('Tu solicitud de acceso aún está pendiente de aprobación.');
        }
        if (accessRequest?.status === 'REJECTED') {
          throw new UnauthorizedException('Tu solicitud de acceso fue rechazada. Contacta con el administrador.');
        }
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!(await passwordMatches(password, user.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.country !== country) {
      this.logger.warn(`Intento de acceso a ${country} con cuenta de ${user.country}: ${email}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Quien siga con una contraseña que no eligió —la clave por defecto de la sede, una
    // temporal del administrador o la aleatoria de la semilla— la conoce alguien más: debe
    // cambiarla antes de obtener un token.
    if (user.usesDefaultPassword) {
      return {
        requireSetup: true as const,
        message: 'Estás usando una contraseña temporal. Crea una contraseña propia para continuar.',
        user: { email: user.email, firstName: user.firstName },
      };
    }

    return {
      message: 'Inicio de sesión exitoso.',
      token: await this.issueToken(user),
      user: await this.publicProfile(user),
    };
  }

  /**
   * Fija la contraseña definitiva en el primer acceso y devuelve ya la sesión iniciada,
   * para que el usuario no tenga que escribir sus credenciales dos veces seguidas.
   */
  async setInitialPassword(email: string, temporaryPassword: string, newPassword: string) {
    validateStrength(newPassword);

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Sólo entra por aquí una cuenta que aún tiene su clave temporal. Una cuenta sin
    // contraseña se recupera demostrando que el correo es suyo, no con este formulario.
    const hash = user?.usesDefaultPassword ? user.password : null;
    const temporaryPasswordValid = hash
      ? await passwordMatches(temporaryPassword, hash)
      : (await simulatePasswordCheck(temporaryPassword), false);

    if (!user || !temporaryPasswordValid) {
      throw new UnauthorizedException(INVALID_TEMPORARY_PASSWORD);
    }

    const updated = await this.prisma.user.update({
      where: { guid: user.guid },
      data: { password: await hashPassword(newPassword), usesDefaultPassword: false },
    });

    return {
      message: 'Contraseña establecida correctamente.',
      token: await this.issueToken(updated),
      user: await this.publicProfile(updated),
    };
  }

  /**
   * Emite el token y lo deja registrado como la sesión activa de la cuenta.
   *
   * El campus admite **una sesión por cuenta**: al entrar desde un dispositivo nuevo, el
   * anterior queda invalidado. La certificación acredita que una persona concreta hizo la
   * formación, así que compartir credenciales la vaciaría de sentido.
   *
   * Al sustituirse `currentSessionJti`, el token anterior deja de valer en la siguiente
   * petición: el guardián sólo acepta el que coincide.
   */
  private async issueToken(user: {
    guid: string;
    email: string;
    role: UserRole;
    country: Country;
    currentSessionJti?: string | null;
  }): Promise<string> {
    const jti = crypto.randomUUID();
    const claims: JwtClaims = {
      sub: user.guid,
      jti,
      email: user.email,
      role: user.role,
      country: user.country,
    };

    const token = await this.jwtService.signAsync(claims);

    await this.prisma.user.update({ where: { guid: user.guid }, data: { currentSessionJti: jti } });

    // Avisa al dispositivo anterior para que limpie su estado y explique lo ocurrido.
    // Sólo si lo había: en el primer acceso no hay ninguna sesión a la que desplazar.
    if (user.currentSessionJti) this.realtime.revokeSession(user.guid, 'session_displaced');

    return token;
  }

  private async publicProfile(user: {
    guid: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    country: Country;
    photoUrl: string | null;
    dataConsentVersion: string | null;
  }) {
    return {
      guid: user.guid,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      country: user.country,
      photoUrl: user.photoUrl,
      consentRequired: user.dataConsentVersion !== (await this.settings.legalVersion(user.country)),
    };
  }

  // ── Solicitudes de acceso ────────────────────────────────────────────────

  /**
   * Registra una solicitud de acceso a una sede.
   * Exige que el correo haya sido verificado antes y consume esa verificación, para que un
   * mismo código no sirva para solicitudes repetidas.
   */
  async requestAccess(dto: RequestAccessDto) {
    const alreadyExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { guid: true },
    });
    if (alreadyExists) {
      throw new BadRequestException('Este correo ya tiene una cuenta. Inicia sesión directamente.');
    }

    const verification = await this.prisma.emailVerification.findFirst({
      where: { email: dto.email, verified: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('Verifica tu correo electrónico antes de enviar la solicitud.');
    }

    const existing = await this.prisma.accessRequest.findUnique({ where: { email: dto.email } });
    if (existing?.status === 'PENDING') {
      throw new BadRequestException('Ya tienes una solicitud pendiente de revisión con este correo.');
    }

    const consentVersion = await this.settings.legalVersion(dto.country);

    const accessRequest = await this.prisma.$transaction(async (tx) => {
      // La verificación se consume aquí para que no pueda reutilizarse.
      await tx.emailVerification.deleteMany({ where: { email: dto.email } });

      const data = {
        firstName: dto.firstName,
        lastName: dto.lastName,
        requestedRole: dto.requestedRole,
        country: dto.country,
        status: 'PENDING' as const,
        rejectionReason: null,
        consentAt: new Date(),
        consentVersion,
      };

      return existing
        ? tx.accessRequest.update({ where: { id: existing.id }, data })
        : tx.accessRequest.create({ data: { email: dto.email, ...data } });
    });

    this.realtime.emitToRole('request:new', { id: accessRequest.id }, dto.country, 'ADMIN');
    void this.notifyAdmins(dto);

    return {
      message: `Solicitud enviada a los administradores de ${countryName(dto.country)}. Recibirás un correo cuando sea revisada.`,
      requestId: accessRequest.id,
    };
  }

  /** Avisa por correo a los administradores de la sede. Los fallos se registran, no se propagan. */
  private async notifyAdmins(dto: RequestAccessDto): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', country: dto.country },
        select: { email: true, firstName: true },
      });
      const results = await settleWithConcurrency(admins, MAIL_CONCURRENCY, (admin) =>
        this.mail.sendAccessRequest(admin.email, admin.firstName, {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          requestedRole: dto.requestedRole,
          country: dto.country,
        }),
      );
      const failed = countRejected(results);
      if (failed > 0) this.logger.error(`No se pudo avisar a ${failed} administrador(es) de ${dto.country}`);
    } catch (error) {
      this.logger.error(`No se pudo avisar a los administradores de ${dto.country}`, error);
    }
  }

  /** Solicitudes pendientes de la sede del administrador que consulta. */
  getPendingAccessRequests(country: Country) {
    return this.prisma.accessRequest.findMany({
      where: { status: 'PENDING', country },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Aprueba una solicitud y crea la cuenta con una clave temporal.
   * La cuenta hereda el país de la solicitud, nunca el del administrador: así una
   * solicitud sólo puede acabar en la sede a la que se dirigió.
   */
  async approveAccessRequest(id: number, country: Country) {
    const accessRequest = await this.pendingRequest(id, country);

    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      // Comprobación dentro de la transacción: entre la solicitud y la aprobación
      // pudo crearse la cuenta por otra vía.
      const duplicate = await tx.user.findUnique({ where: { email: accessRequest.email }, select: { guid: true } });
      if (duplicate) {
        throw new BadRequestException('Ya existe una cuenta con ese correo. Rechaza la solicitud.');
      }

      await tx.accessRequest.update({ where: { id }, data: { status: 'ACCEPTED', rejectionReason: null } });

      return tx.user.create({
        data: {
          email: accessRequest.email,
          firstName: accessRequest.firstName,
          lastName: accessRequest.lastName,
          role: accessRequest.requestedRole,
          country: accessRequest.country,
          password: hash,
          usesDefaultPassword: true,
          dataConsentAt: accessRequest.consentAt,
          dataConsentVersion: accessRequest.consentVersion,
        },
      });
    });

    this.realtime.emitToRole('request:resolved', { id, action: 'approved' }, country, 'ADMIN');
    this.realtime.emitToRole('user:created', { guid: user.guid }, country, 'ADMIN');

    this.mail
      .sendWelcome(accessRequest.email, accessRequest.firstName, temporaryPassword, accessRequest.country)
      .catch((error) => this.logger.error('No se pudo enviar el correo de bienvenida', error));

    return { message: 'Solicitud aprobada. La persona recibirá por correo una contraseña temporal propia.' };
  }

  /**
   * Rechaza una solicitud conservando el registro, para que quede constancia de quién fue
   * rechazado y por qué, y se lo comunica por correo a quien la envió.
   */
  async rejectAccessRequest(id: number, country: Country, reason?: string) {
    const accessRequest = await this.pendingRequest(id, country);
    const rejectionReason = reason?.trim() || null;

    await this.prisma.accessRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason },
    });

    this.realtime.emitToRole('request:resolved', { id, action: 'rejected' }, country, 'ADMIN');

    this.mail
      .sendAccessRequestRejected(accessRequest.email, accessRequest.firstName, rejectionReason, accessRequest.country)
      .catch((error) => this.logger.error('No se pudo enviar el aviso de solicitud rechazada', error));

    return { message: 'Solicitud rechazada. La persona recibirá un correo con la decisión.' };
  }

  /** Carga una solicitud comprobando que es de la sede del administrador y sigue pendiente. */
  private async pendingRequest(id: number, country: Country) {
    const accessRequest = await this.prisma.accessRequest.findFirst({ where: { id, country } });
    if (!accessRequest) throw new NotFoundException('Solicitud no encontrada.');
    if (accessRequest.status !== 'PENDING') throw new BadRequestException('Esta solicitud ya fue procesada.');
    return accessRequest;
  }

  // ── Recuperación de contraseña ───────────────────────────────────────────

  /**
   * Envía un enlace de recuperación. La respuesta es idéntica exista o no la cuenta.
   * Los enlaces anteriores del mismo correo se invalidan para que sólo uno esté vivo.
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return PASSWORD_RESET_RESPONSE;

    const token = crypto.randomBytes(32).toString('hex');

    await this.prisma.$transaction([
      this.prisma.passwordReset.updateMany({ where: { email, used: false }, data: { used: true } }),
      this.prisma.passwordReset.create({
        data: { email, token, expiresAt: new Date(Date.now() + RESET_VALIDITY_MS) },
      }),
    ]);

    this.mail
      .sendPasswordReset(email, token, user.firstName, user.country)
      .catch((error) => this.logger.error('No se pudo enviar el correo de recuperación', error));

    return PASSWORD_RESET_RESPONSE;
  }

  /**
   * Restablece la contraseña a partir de un enlace válido y cierra las sesiones abiertas:
   * si el enlace se usó porque alguien perdió el control de la cuenta, el intruso queda
   * fuera de inmediato.
   */
  async resetPassword(token: string, newPassword: string) {
    validateStrength(newPassword);

    const record = await this.prisma.passwordReset.findUnique({ where: { token } });
    if (!record || record.used) {
      throw new BadRequestException('Este enlace no es válido o ya fue utilizado. Solicita uno nuevo.');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('El enlace ha caducado. Solicita uno nuevo.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: record.email } });
    if (!user) throw new BadRequestException('Este enlace no es válido. Solicita uno nuevo.');

    // Un enlace de recuperación se usa precisamente cuando la sesión anterior puede haber
    // quedado expuesta: sin sesión vigente, su token deja de valer en la siguiente petición.
    const hash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { guid: user.guid },
        data: { password: hash, usesDefaultPassword: false, currentSessionJti: null },
      }),
      this.prisma.passwordReset.update({ where: { id: record.id }, data: { used: true } }),
    ]);
    this.realtime.revokeSession(user.guid, 'password_reset');

    return { message: 'Contraseña restablecida. Ya puedes iniciar sesión.' };
  }

  // ── Verificación de correo ───────────────────────────────────────────────

  /** Envía un código de 6 dígitos para probar que el correo pertenece a quien solicita acceso. */
  async requestVerificationCode(email: string, country: Country) {
    const alreadyExists = await this.prisma.user.findUnique({ where: { email }, select: { guid: true } });
    if (alreadyExists) {
      throw new BadRequestException('Este correo ya tiene una cuenta. Inicia sesión directamente.');
    }

    const recent = await this.prisma.emailVerification.findFirst({
      where: { email, createdAt: { gt: new Date(Date.now() - RESEND_DELAY_MS) } },
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException('Ya te enviamos un código hace menos de un minuto. Revisa tu bandeja de entrada.');
    }

    // `randomInt` en lugar de `Math.random`: el código es un secreto de un solo uso.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.prisma.$transaction([
      this.prisma.emailVerification.deleteMany({ where: { email } }),
      this.prisma.emailVerification.create({
        data: { email, code, expiresAt: new Date(Date.now() + CODE_VALIDITY_MS) },
      }),
    ]);

    await this.mail.sendVerificationCode(email, code, country);
    return { message: 'Te enviamos un código de verificación a tu correo electrónico.' };
  }

  /**
   * Confirma el código recibido por correo.
   *
   * Cada fallo se cuenta y, al llegar a {@link MAX_CODE_ATTEMPTS}, el código deja de
   * valer. El límite por dirección IP no basta: seis dígitos son pocos y probarlos desde
   * muchas direcciones es barato.
   */
  async confirmEmailVerification(email: string, code: string) {
    const record = await this.prisma.emailVerification.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('El código no es correcto. Revísalo e inténtalo de nuevo.');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('El código ha caducado. Solicita uno nuevo.');
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestException('Has agotado los intentos con este código. Solicita uno nuevo.');
    }

    if (record.code !== code) {
      const { attempts } = await this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });

      const remaining = Math.max(MAX_CODE_ATTEMPTS - attempts, 0);
      throw new BadRequestException(
        remaining > 0
          ? `El código no es correcto. ${plural(remaining, 'Te queda', 'Te quedan')} ${remaining} ${plural(remaining, 'intento', 'intentos')}.`
          : 'Has agotado los intentos con este código. Solicita uno nuevo.',
      );
    }

    if (!record.verified) {
      await this.prisma.emailVerification.update({ where: { id: record.id }, data: { verified: true } });
    }

    return { message: 'Correo verificado correctamente.', verified: true };
  }
}
