import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenBlacklistService } from '../../auth/token-blacklist.service';

/** Cada cuánto, como máximo, se persiste `ultimo_acceso` de un mismo usuario. */
const INTERVALO_ULTIMO_ACCESO_MS = 5 * 60 * 1000;

/** Cada cuánto se purgan las marcas de escritura ya caducadas. */
const INTERVALO_LIMPIEZA_MS = 60 * 60 * 1000;

/**
 * Autenticación por JWT para todas las rutas.
 *
 * Además de validar la firma, en cada petición comprueba contra la base de datos que la
 * cuenta siga existiendo, activa y con el rol y país vigentes. Esto cuesta una consulta
 * por petición, pero es lo que permite que desactivar una cuenta o cambiarla de rol surta
 * efecto al instante en lugar de esperar a que caduque el token.
 *
 * Las rutas marcadas con `@Public()` no exigen token; si viene uno válido se usa, y si
 * viene uno inválido se ignora en silencio en lugar de rechazar la petición.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(JwtAuthGuard.name);
  /** guid → instante de la última escritura de `ultimo_acceso`. */
  private readonly ultimoAccesoEscrito = new Map<string, number>();
  private readonly limpieza: ReturnType<typeof setInterval>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {
    this.limpieza = setInterval(() => this.purgarMarcas(), INTERVALO_LIMPIEZA_MS);
    this.limpieza.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.limpieza);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    const token = this.extraerToken(request);

    if (!token) {
      if (esPublica) return true;
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    try {
      request.user = await this.resolverIdentidad(token);
      return true;
    } catch (error) {
      // En rutas públicas un token inválido no impide el acceso: simplemente se
      // atiende la petición como anónima.
      if (esPublica) return true;
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Token inválido o expirado.');
    }
  }

  /**
   * Verifica el token y lo contrasta con el estado actual de la cuenta.
   * @throws UnauthorizedException con un mensaje que el cliente distingue para decidir
   *         si muestra «sesión expirada» o «sesión revocada».
   */
  private async resolverIdentidad(token: string): Promise<JwtPayload> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });

    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    if (this.tokenBlacklist.estaRevocado(payload.sub, payload.jti, payload.iat)) {
      throw new UnauthorizedException('Sesión revocada. Vuelve a iniciar sesión.');
    }

    const cuenta = await this.prisma.usuarios.findUnique({
      where: { guid: payload.sub },
      select: { guid: true, email: true, activo: true, rol: true, pais: true, sesion_actual_jti: true },
    });

    if (!cuenta) {
      throw new UnauthorizedException('Tu cuenta ya no existe en el sistema.');
    }
    if (!cuenta.activo) {
      throw new UnauthorizedException('Tu cuenta ha sido desactivada.');
    }

    // Una sola sesión por cuenta: si alguien entró después desde otro dispositivo, este
    // token deja de valer. Se distingue del resto de casos para poder explicárselo.
    if (cuenta.sesion_actual_jti && payload.jti !== cuenta.sesion_actual_jti) {
      throw new UnauthorizedException('Tu sesión se cerró porque iniciaste sesión en otro dispositivo.');
    }

    this.marcarAcceso(cuenta.guid);

    // El rol y el país mandan desde la base de datos, no desde el token.
    return {
      sub: cuenta.guid,
      email: cuenta.email,
      role: cuenta.rol,
      pais: cuenta.pais,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  /**
   * Registra la actividad del usuario como mucho una vez cada cinco minutos.
   * La escritura no se espera: que falle no debe tumbar la petición del usuario.
   */
  private marcarAcceso(guid: string): void {
    const ahora = Date.now();
    const ultima = this.ultimoAccesoEscrito.get(guid) ?? 0;
    if (ahora - ultima <= INTERVALO_ULTIMO_ACCESO_MS) return;

    this.ultimoAccesoEscrito.set(guid, ahora);
    this.prisma.usuarios
      .update({ where: { guid }, data: { ultimo_acceso: new Date(ahora) } })
      .catch((error) => this.logger.warn(`No se pudo registrar ultimo_acceso de ${guid}: ${error?.message}`));
  }

  /** Evita que el mapa de marcas crezca sin límite con usuarios que ya no vuelven. */
  private purgarMarcas(): void {
    const corte = Date.now() - 2 * INTERVALO_ULTIMO_ACCESO_MS;
    for (const [guid, instante] of this.ultimoAccesoEscrito) {
      if (instante < corte) this.ultimoAccesoEscrito.delete(guid);
    }
  }

  private extraerToken(request: { headers?: Record<string, unknown> }): string | undefined {
    const cabecera = request.headers?.authorization;
    if (typeof cabecera !== 'string') return undefined;
    const [tipo, token] = cabecera.split(' ');
    return tipo === 'Bearer' && token ? token : undefined;
  }
}
