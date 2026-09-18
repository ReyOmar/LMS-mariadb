import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { Pais, nombrePais } from '../common/domain/pais';
import { cifrar, coincide, validarFortaleza } from '../common/domain/password';
import { JwtClaims, RolUsuario } from '../common/interfaces/jwt-payload.interface';
import { SolicitarAccesoDto } from './dto/solicitar-acceso.dto';

/** Vigencia del enlace de recuperación de contraseña. */
const VIGENCIA_RESET_MS = 60 * 60 * 1000;

/** Vigencia del código de verificación de correo. */
const VIGENCIA_CODIGO_MS = 10 * 60 * 1000;

/** Espera mínima entre dos envíos de código al mismo correo. */
const ESPERA_REENVIO_MS = 60 * 1000;

/**
 * Respuesta neutra de recuperación de contraseña.
 * Se devuelve exista o no la cuenta, para no revelar qué correos están registrados.
 */
const RESPUESTA_RECUPERACION = {
  message: 'Si el correo está registrado, recibirás un enlace de recuperación en unos minutos.',
};

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
    private readonly configuracion: ConfiguracionService,
    private readonly tokenBlacklist: TokenBlacklistService,
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
  async login(email: string, contrasena: string, pais: Pais) {
    const usuario = await this.prisma.usuarios.findUnique({ where: { email } });

    if (!usuario) {
      const solicitud = await this.prisma.lms_solicitudes_acceso.findUnique({ where: { email } });
      if (solicitud?.estado === 'PENDIENTE') {
        throw new UnauthorizedException('Tu solicitud de acceso aún está pendiente de aprobación.');
      }
      if (solicitud?.estado === 'RECHAZADA') {
        throw new UnauthorizedException('Tu solicitud de acceso fue rechazada. Contacta con el administrador.');
      }
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('Tu cuenta está desactivada. Contacta con el administrador.');
    }

    if (!(await coincide(contrasena, usuario.contrasena))) {
      // Una cuenta aprobada sin contraseña todavía necesita el flujo de primer acceso,
      // pero sólo se revela después de comprobar que la sede coincide.
      if (!usuario.contrasena && usuario.pais === pais) {
        return this.respuestaPrimerAcceso(usuario.email, usuario.nombre, 'Crea tu contraseña para entrar.');
      }
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (usuario.pais !== pais) {
      this.logger.warn(`Intento de acceso a ${pais} con cuenta de ${usuario.pais}: ${email}`);
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    // Quien siga usando la clave temporal debe cambiarla antes de obtener un token.
    const claveTemporal = await this.configuracion.getContrasenaDefecto(usuario.pais);
    if (usuario.usa_clave_defecto && contrasena === claveTemporal) {
      return this.respuestaPrimerAcceso(
        usuario.email,
        usuario.nombre,
        'Estás usando la contraseña temporal. Crea una contraseña propia para continuar.',
      );
    }

    return {
      message: 'Inicio de sesión exitoso.',
      token: await this.emitirToken(usuario),
      user: this.perfilPublico(usuario),
    };
  }

  private respuestaPrimerAcceso(email: string, nombre: string, message: string) {
    return { requireSetup: true as const, message, user: { email, nombre } };
  }

  /**
   * Fija la contraseña definitiva en el primer acceso y devuelve ya la sesión iniciada,
   * para que el usuario no tenga que escribir sus credenciales dos veces seguidas.
   */
  async setupPassword(email: string, contrasenaTemporal: string, nuevaContrasena: string) {
    validarFortaleza(nuevaContrasena);

    const usuario = await this.prisma.usuarios.findUnique({ where: { email } });
    if (!usuario) throw new NotFoundException('No existe ninguna cuenta con ese correo.');
    if (!usuario.activo) throw new UnauthorizedException('Tu cuenta está desactivada.');

    if (!usuario.usa_clave_defecto) {
      throw new BadRequestException(
        'Esta cuenta ya tiene contraseña propia. Si la olvidaste, usa "Recuperar contraseña".',
      );
    }

    const temporalValida = usuario.contrasena
      ? await coincide(contrasenaTemporal, usuario.contrasena)
      : contrasenaTemporal === (await this.configuracion.getContrasenaDefecto(usuario.pais));

    if (!temporalValida) {
      throw new UnauthorizedException('La contraseña temporal no es correcta.');
    }

    const actualizado = await this.prisma.usuarios.update({
      where: { guid: usuario.guid },
      data: { contrasena: await cifrar(nuevaContrasena), usa_clave_defecto: false },
    });

    return {
      message: 'Contraseña establecida correctamente.',
      token: await this.emitirToken(actualizado),
      user: this.perfilPublico(actualizado),
    };
  }

  /**
   * Emite el token y lo deja registrado como la sesión activa de la cuenta.
   *
   * El campus admite **una sesión por cuenta**: al entrar desde un dispositivo nuevo, el
   * anterior queda invalidado. La certificación acredita que una persona concreta hizo la
   * formación, así que compartir credenciales la vaciaría de sentido.
   *
   * La sesión anterior se marca como revocada además de sustituirse, para que su token
   * deje de valer de inmediato aunque el guard leyera una copia cacheada de la cuenta.
   */
  private async emitirToken(usuario: {
    guid: string;
    email: string;
    rol: RolUsuario;
    pais: Pais;
    sesion_actual_jti?: string | null;
  }): Promise<string> {
    const jti = crypto.randomUUID();
    const claims: JwtClaims = {
      sub: usuario.guid,
      jti,
      email: usuario.email,
      role: usuario.rol,
      pais: usuario.pais,
    };

    const token = await this.jwtService.signAsync(claims);

    if (usuario.sesion_actual_jti) {
      await this.tokenBlacklist.revocarSesion(usuario.guid, usuario.sesion_actual_jti);
    }
    await this.prisma.usuarios.update({ where: { guid: usuario.guid }, data: { sesion_actual_jti: jti } });

    // Avisa al dispositivo anterior para que limpie su estado y explique lo ocurrido.
    this.realtime.revocarSesion(usuario.guid, 'sesion_desplazada');

    return token;
  }

  private perfilPublico(usuario: {
    guid: string;
    rol: RolUsuario;
    nombre: string;
    apellido: string;
    pais: Pais;
    foto_url: string | null;
  }) {
    return {
      guid: usuario.guid,
      role: usuario.rol,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      pais: usuario.pais,
      foto_url: usuario.foto_url,
    };
  }

  // ── Solicitudes de acceso ────────────────────────────────────────────────

  /**
   * Registra una solicitud de acceso a una sede.
   * Exige que el correo haya sido verificado antes y consume esa verificación, para que un
   * mismo código no sirva para solicitudes repetidas.
   */
  async requestAccess(dto: SolicitarAccesoDto) {
    const yaExiste = await this.prisma.usuarios.findUnique({
      where: { email: dto.email },
      select: { guid: true },
    });
    if (yaExiste) {
      throw new BadRequestException('Este correo ya tiene una cuenta. Inicia sesión directamente.');
    }

    const verificacion = await this.prisma.lms_verificacion_email.findFirst({
      where: { email: dto.email, verificado: true, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });
    if (!verificacion) {
      throw new BadRequestException('Verifica tu correo electrónico antes de enviar la solicitud.');
    }

    const previa = await this.prisma.lms_solicitudes_acceso.findUnique({ where: { email: dto.email } });
    if (previa?.estado === 'PENDIENTE') {
      throw new BadRequestException('Ya tienes una solicitud pendiente de revisión con este correo.');
    }

    const solicitud = await this.prisma.$transaction(async (tx) => {
      // La verificación se consume aquí para que no pueda reutilizarse.
      await tx.lms_verificacion_email.deleteMany({ where: { email: dto.email } });

      const datos = {
        nombre: dto.nombre,
        apellido: dto.apellido,
        rol_pedido: dto.rol_pedido,
        pais: dto.pais,
        estado: 'PENDIENTE' as const,
        motivo: null,
      };

      return previa
        ? tx.lms_solicitudes_acceso.update({ where: { id: previa.id }, data: datos })
        : tx.lms_solicitudes_acceso.create({ data: { email: dto.email, ...datos } });
    });

    this.realtime.emitirARol('request:new', { id: solicitud.id }, dto.pais, 'ADMINISTRADOR');
    void this.avisarAdministradores(dto);

    return {
      message: `Solicitud enviada a los administradores de ${nombrePais(dto.pais)}. Recibirás un correo cuando sea revisada.`,
      request_id: solicitud.id,
    };
  }

  /** Avisa por correo a los administradores de la sede. Los fallos se registran, no se propagan. */
  private async avisarAdministradores(dto: SolicitarAccesoDto): Promise<void> {
    try {
      const admins = await this.prisma.usuarios.findMany({
        where: { rol: 'ADMINISTRADOR', activo: true, pais: dto.pais },
        select: { email: true, nombre: true },
      });
      await Promise.all(
        admins.map((admin) =>
          this.mail.sendNewAccessRequest(admin.email, admin.nombre, {
            nombre: dto.nombre,
            apellido: dto.apellido,
            email: dto.email,
            rol_pedido: dto.rol_pedido,
            pais: dto.pais,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(`No se pudo avisar a los administradores de ${dto.pais}`, error);
    }
  }

  /** Solicitudes pendientes de la sede del administrador que consulta. */
  getPendingRequests(pais: Pais) {
    return this.prisma.lms_solicitudes_acceso.findMany({
      where: { estado: 'PENDIENTE', pais },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Aprueba una solicitud y crea la cuenta con una clave temporal.
   * La cuenta hereda el país de la solicitud, nunca el del administrador: así una
   * solicitud sólo puede acabar en la sede a la que se dirigió.
   */
  async approveRequest(id: number, pais: Pais) {
    const solicitud = await this.solicitudPendiente(id, pais);

    const claveTemporal = await this.configuracion.getContrasenaDefecto(solicitud.pais);
    const hash = await cifrar(claveTemporal);

    const usuario = await this.prisma.$transaction(async (tx) => {
      // Comprobación dentro de la transacción: entre la solicitud y la aprobación
      // pudo crearse la cuenta por otra vía.
      const duplicado = await tx.usuarios.findUnique({ where: { email: solicitud.email }, select: { guid: true } });
      if (duplicado) {
        throw new BadRequestException('Ya existe una cuenta con ese correo. Rechaza la solicitud.');
      }

      await tx.lms_solicitudes_acceso.update({ where: { id }, data: { estado: 'ACEPTADA', motivo: null } });

      return tx.usuarios.create({
        data: {
          email: solicitud.email,
          nombre: solicitud.nombre,
          apellido: solicitud.apellido,
          rol: solicitud.rol_pedido,
          pais: solicitud.pais,
          contrasena: hash,
          usa_clave_defecto: true,
        },
      });
    });

    this.realtime.emitirARol('request:resolved', { id, action: 'approved' }, pais, 'ADMINISTRADOR');
    this.realtime.emitirARol('user:created', { guid: usuario.guid }, pais, 'ADMINISTRADOR');

    this.mail
      .sendWelcomeEmail(solicitud.email, solicitud.nombre, claveTemporal, solicitud.pais)
      .catch((error) => this.logger.error('No se pudo enviar el correo de bienvenida', error));

    return { message: 'Solicitud aprobada. La cuenta se creó con una contraseña temporal.' };
  }

  /**
   * Rechaza una solicitud conservando el registro.
   * Antes se borraba la fila, lo que permitía volver a solicitar de inmediato y dejaba sin
   * trazabilidad quién había sido rechazado y por qué.
   */
  async rejectRequest(id: number, pais: Pais, motivo?: string) {
    await this.solicitudPendiente(id, pais);

    await this.prisma.lms_solicitudes_acceso.update({
      where: { id },
      data: { estado: 'RECHAZADA', motivo: motivo?.trim() || null },
    });

    this.realtime.emitirARol('request:resolved', { id, action: 'rejected' }, pais, 'ADMINISTRADOR');
    return { message: 'Solicitud rechazada.' };
  }

  /** Carga una solicitud comprobando que es de la sede del administrador y sigue pendiente. */
  private async solicitudPendiente(id: number, pais: Pais) {
    const solicitud = await this.prisma.lms_solicitudes_acceso.findFirst({ where: { id, pais } });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
    if (solicitud.estado !== 'PENDIENTE') throw new BadRequestException('Esta solicitud ya fue procesada.');
    return solicitud;
  }

  // ── Recuperación de contraseña ───────────────────────────────────────────

  /**
   * Envía un enlace de recuperación. La respuesta es idéntica exista o no la cuenta.
   * Los enlaces anteriores del mismo correo se invalidan para que sólo uno esté vivo.
   */
  async requestPasswordReset(email: string) {
    const usuario = await this.prisma.usuarios.findUnique({ where: { email } });
    if (!usuario || !usuario.activo) return RESPUESTA_RECUPERACION;

    const token = crypto.randomBytes(32).toString('hex');

    await this.prisma.$transaction([
      this.prisma.lms_password_resets.updateMany({ where: { email, usado: false }, data: { usado: true } }),
      this.prisma.lms_password_resets.create({
        data: { email, token, expires_at: new Date(Date.now() + VIGENCIA_RESET_MS) },
      }),
    ]);

    this.mail
      .sendPasswordResetEmail(email, token, usuario.nombre, usuario.pais)
      .catch((error) => this.logger.error('No se pudo enviar el correo de recuperación', error));

    return RESPUESTA_RECUPERACION;
  }

  /**
   * Restablece la contraseña a partir de un enlace válido y cierra las sesiones abiertas:
   * si el enlace se usó porque alguien perdió el control de la cuenta, el intruso queda
   * fuera de inmediato.
   */
  async resetPassword(token: string, nuevaContrasena: string) {
    validarFortaleza(nuevaContrasena);

    const registro = await this.prisma.lms_password_resets.findUnique({ where: { token } });
    if (!registro || registro.usado) {
      throw new BadRequestException('Este enlace no es válido o ya fue utilizado. Solicita uno nuevo.');
    }
    if (registro.expires_at < new Date()) {
      throw new BadRequestException('El enlace ha caducado. Solicita uno nuevo.');
    }

    const usuario = await this.prisma.usuarios.findUnique({ where: { email: registro.email } });
    if (!usuario) throw new BadRequestException('Este enlace no es válido. Solicita uno nuevo.');

    const hash = await cifrar(nuevaContrasena);
    await this.prisma.$transaction([
      this.prisma.usuarios.update({
        where: { guid: usuario.guid },
        data: { contrasena: hash, usa_clave_defecto: false },
      }),
      this.prisma.lms_password_resets.update({ where: { id: registro.id }, data: { usado: true } }),
    ]);

    this.realtime.revocarSesion(usuario.guid, 'password_reset');

    return { message: 'Contraseña restablecida. Ya puedes iniciar sesión.' };
  }

  // ── Verificación de correo ───────────────────────────────────────────────

  /** Envía un código de 6 dígitos para probar que el correo pertenece a quien solicita acceso. */
  async sendEmailVerification(email: string) {
    const yaExiste = await this.prisma.usuarios.findUnique({ where: { email }, select: { guid: true } });
    if (yaExiste) {
      throw new BadRequestException('Este correo ya tiene una cuenta. Inicia sesión directamente.');
    }

    const reciente = await this.prisma.lms_verificacion_email.findFirst({
      where: { email, created_at: { gt: new Date(Date.now() - ESPERA_REENVIO_MS) } },
      select: { id: true },
    });
    if (reciente) {
      throw new BadRequestException('Ya te enviamos un código hace menos de un minuto. Revisa tu bandeja de entrada.');
    }

    // `randomInt` en lugar de `Math.random`: el código es un secreto de un solo uso.
    const codigo = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    await this.prisma.$transaction([
      this.prisma.lms_verificacion_email.deleteMany({ where: { email } }),
      this.prisma.lms_verificacion_email.create({
        data: { email, codigo, expires_at: new Date(Date.now() + VIGENCIA_CODIGO_MS) },
      }),
    ]);

    await this.mail.sendEmailVerificationCode(email, codigo);
    return { message: 'Te enviamos un código de verificación a tu correo electrónico.' };
  }

  /** Confirma el código recibido por correo. */
  async confirmEmailVerification(email: string, codigo: string) {
    const registro = await this.prisma.lms_verificacion_email.findFirst({
      where: { email },
      orderBy: { created_at: 'desc' },
    });

    if (!registro || registro.codigo !== codigo) {
      throw new BadRequestException('El código no es correcto. Revísalo e inténtalo de nuevo.');
    }
    if (registro.expires_at < new Date()) {
      throw new BadRequestException('El código ha caducado. Solicita uno nuevo.');
    }

    if (!registro.verificado) {
      await this.prisma.lms_verificacion_email.update({ where: { id: registro.id }, data: { verificado: true } });
    }

    return { message: 'Correo verificado correctamente.', verificado: true };
  }
}
