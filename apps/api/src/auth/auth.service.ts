import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { Country } from '../common/domain/country';
import { plural } from '../common/domain/text';
import { hashPassword, passwordMatches, simulatePasswordCheck, validateStrength } from '../common/domain/password';
import { JwtClaims, UserRole } from '../common/interfaces/jwt-payload.interface';

/** Vigencia del enlace de recuperación de contraseña. */
const RESET_VALIDITY_MS = 60 * 60 * 1000;

/** Vigencia del código de verificación de correo. */
const CODE_VALIDITY_MS = 10 * 60 * 1000;

/** Espera mínima entre dos envíos de código al mismo correo. */
const RESEND_DELAY_MS = 60 * 1000;

/** Intentos que admite un código de verificación antes de invalidarse. */
const MAX_CODE_ATTEMPTS = 5;

const CODE_EXHAUSTED = 'Has agotado los intentos con este código. Solicita uno nuevo.';

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
 * Flujos de autenticación: entrada y salida, primer acceso con la clave temporal, verificación de
 * correo y recuperación de contraseña. Las solicitudes de acceso están en `AccessRequestsService`;
 * la cuenta propia, en `ProfileService`, y las demás cuentas de la sede, en `UserService`.
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

  // ── Entrada y salida ─────────────────────────────────────────────────────

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
   * Cierra la sesión indicada: sin sesión vigente, su token deja de valer.
   * El borrado se condiciona al `jti` para que un cierre tardío de una sesión ya desplazada
   * no eche al dispositivo que entró después.
   */
  async logout(guid: string, jti: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { guid, currentSessionJti: jti },
      data: { currentSessionJti: null },
    });
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
  private async issueToken(user: { guid: string; currentSessionJti?: string | null }): Promise<string> {
    const jti = crypto.randomUUID();
    const claims: JwtClaims = { sub: user.guid, jti };
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

  // ── Recuperación de contraseña ───────────────────────────────────────────

  /**
   * Envía un enlace de recuperación. La respuesta es idéntica exista o no la cuenta.
   * Los enlaces anteriores del mismo correo se invalidan para que sólo uno esté vivo.
   *
   * El enlace va siempre al correo guardado en la cuenta, nunca al escrito en el formulario:
   * la base los compara sin distinguir tildes, y enviarlo al escrito pondría en manos de quien
   * controle `juan@empresá.com` la cuenta de `juan@empresa.com`.
   */
  async requestPasswordReset(typedEmail: string) {
    const user = await this.prisma.user.findUnique({ where: { email: typedEmail } });
    if (!user) return PASSWORD_RESET_RESPONSE;

    const { email } = user;
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

  /**
   * Envía un código de 6 dígitos para probar que el correo pertenece a quien solicita acceso.
   *
   * La respuesta es la misma tenga o no cuenta el correo, o una solicitud pendiente: si no,
   * cualquiera podría averiguar qué correos están registrados. Quien ya tiene una u otra
   * recibe en su buzón, en lugar del código, el aviso de cómo seguir: sólo su dueño se entera.
   *
   * Responde con los segundos que faltan para poder pedir otro. Quien lo vuelve a pedir antes
   * de tiempo —recargó la página o volvió atrás— ya tiene un código válido en su bandeja: no
   * se le envía otro, pero tampoco se le cierra el paso a escribir el que tiene.
   */
  async requestVerificationCode(email: string, country: Country) {
    const recent = await this.prisma.emailVerification.findFirst({
      where: { email, createdAt: { gt: new Date(Date.now() - RESEND_DELAY_MS) } },
      select: { createdAt: true },
    });
    if (recent) {
      return {
        message: 'Ya te enviamos un código hace menos de un minuto. Revisa tu bandeja de entrada.',
        resendInSeconds: Math.ceil((recent.createdAt.getTime() + RESEND_DELAY_MS - Date.now()) / 1000),
      };
    }

    // `randomInt` en lugar de `Math.random`: el código es un secreto de un solo uso.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.prisma.$transaction([
      this.prisma.emailVerification.deleteMany({ where: { email } }),
      this.prisma.emailVerification.create({
        data: { email, code, expiresAt: new Date(Date.now() + CODE_VALIDITY_MS) },
      }),
    ]);

    // El código se guarda también para quien no lo va a recibir: un código equivocado tiene que
    // responder igual, con los intentos que quedan, tenga o no cuenta el correo.
    // El envío no se espera, como en el resto de correos: con el proveedor lento o caído la
    // respuesta tardaría lo que sus reintentos —cerca de un minuto— para decir lo mismo; y lo
    // que tarde averiguar qué correo toca tampoco delata nada.
    this.deliverVerification(email, code, country).catch((error) =>
      this.logger.error('No se pudo enviar el correo de verificación', error),
    );
    return {
      message: 'Revisa tu correo electrónico: te enviamos un código de verificación.',
      resendInSeconds: RESEND_DELAY_MS / 1000,
    };
  }

  /** El código o, si el correo ya tiene cuenta o una solicitud en revisión, el aviso de ello. */
  private async deliverVerification(email: string, code: string, country: Country): Promise<void> {
    const [account, request] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { firstName: true, country: true } }),
      this.prisma.accessRequest.findUnique({ where: { email }, select: { status: true, country: true } }),
    ]);
    if (account) return this.mail.sendAccountExists(email, account.firstName, account.country);
    if (request?.status === 'PENDING') return this.mail.sendAccessRequestPending(email, request.country);
    return this.mail.sendVerificationCode(email, code, country);
  }

  /**
   * Confirma el código recibido por correo.
   *
   * Cada intento se cuenta y, al llegar a {@link MAX_CODE_ATTEMPTS}, el código deja de
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

    // El intento se gasta antes de comparar, y sólo si queda alguno. Mirando el recuento
    // primero y sumándolo después, cien peticiones a la vez leerían el mismo recuento y
    // probarían cien códigos.
    const { count } = await this.prisma.emailVerification.updateMany({
      where: { id: record.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0) {
      throw new BadRequestException(CODE_EXHAUSTED);
    }

    if (record.code !== code) {
      const remaining = Math.max(MAX_CODE_ATTEMPTS - record.attempts - 1, 0);
      throw new BadRequestException(
        remaining > 0
          ? `El código no es correcto. ${plural(remaining, 'Te queda', 'Te quedan')} ${remaining} ${plural(remaining, 'intento', 'intentos')}.`
          : CODE_EXHAUSTED,
      );
    }

    if (!record.verified) {
      await this.prisma.emailVerification.update({ where: { id: record.id }, data: { verified: true } });
    }

    return { message: 'Correo verificado correctamente.', verified: true };
  }
}
