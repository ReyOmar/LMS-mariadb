import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

/** Cada cuánto, como máximo, se persiste `lastAccessAt` de un mismo usuario. */
const LAST_ACCESS_INTERVAL_MS = 5 * 60 * 1000;

/** Cada cuánto se purgan las marcas de escritura ya caducadas. */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Autenticación por JWT para todas las rutas.
 *
 * Además de validar la firma, en cada petición comprueba contra la base de datos que la
 * cuenta siga existiendo y con el rol y país vigentes. Esto cuesta una consulta por
 * petición, pero es lo que permite que borrar una cuenta o cambiarla de rol surta efecto
 * al instante en lugar de esperar a que caduque el token.
 *
 * Las rutas marcadas con `@Public()` no exigen token; si viene uno válido se usa, y si
 * viene uno inválido se ignora en silencio en lugar de rechazar la petición.
 */
@Injectable()
export class JwtGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(JwtGuard.name);
  /** guid → instante de la última escritura de `lastAccessAt`. */
  private readonly lastAccessWrites = new Map<string, number>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    this.cleanupTimer = setInterval(() => this.pruneAccessTimestamps(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: JwtPayload }>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    try {
      request.user = await this.resolveIdentity(token);
      return true;
    } catch (error) {
      // En rutas públicas un token inválido no impide el acceso: simplemente se
      // atiende la petición como anónima.
      if (isPublic) return true;
      throw error instanceof UnauthorizedException ? error : new UnauthorizedException('Token inválido o expirado.');
    }
  }

  /**
   * Verifica el token y lo contrasta con el estado actual de la cuenta.
   * @throws UnauthorizedException con un mensaje que el cliente distingue para decidir
   *         si muestra «sesión expirada» o «sesión revocada».
   */
  private async resolveIdentity(token: string): Promise<JwtPayload> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const account = await this.prisma.user.findUnique({
      where: { guid: payload.sub },
      select: { guid: true, email: true, role: true, country: true, currentSessionJti: true },
    });

    // El orden va de lo más concreto a lo más genérico: el mensaje que reciba el usuario
    // es el único sitio donde se le explica por qué se quedó fuera.
    if (!account) {
      throw new UnauthorizedException('Tu cuenta ya no existe en el sistema.');
    }

    // Una sola sesión válida por cuenta, y la dice la base —no una lista en memoria, que
    // cada proceso de la API tendría distinta—: el token tiene que ser exactamente
    // `currentSessionJti`. Cerrar sesión y cambiar o restablecer la contraseña la dejan a
    // nulo; entrar desde otro dispositivo la sustituye.
    if (payload.jti !== account.currentSessionJti) {
      throw new UnauthorizedException(
        account.currentSessionJti
          ? 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo.'
          : 'Sesión revocada. Vuelve a iniciar sesión.',
      );
    }

    this.touchLastAccess(account.guid);

    // El rol y el país mandan desde la base de datos, no desde el token.
    return {
      sub: account.guid,
      email: account.email,
      role: account.role,
      country: account.country,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  /**
   * Registra la actividad del usuario como mucho una vez cada cinco minutos.
   * La escritura no se espera: que falle no debe tumbar la petición del usuario.
   */
  private touchLastAccess(guid: string): void {
    const now = Date.now();
    const last = this.lastAccessWrites.get(guid) ?? 0;
    if (now - last <= LAST_ACCESS_INTERVAL_MS) return;

    this.lastAccessWrites.set(guid, now);
    this.prisma.user
      .update({ where: { guid }, data: { lastAccessAt: new Date(now) } })
      .catch((error: Error) => this.logger.warn(`No se pudo registrar el último acceso de ${guid}: ${error.message}`));
  }

  /** Evita que el mapa de marcas crezca sin límite con usuarios que ya no vuelven. */
  private pruneAccessTimestamps(): void {
    const cutoff = Date.now() - 2 * LAST_ACCESS_INTERVAL_MS;
    for (const [guid, instant] of this.lastAccessWrites) {
      if (instant < cutoff) this.lastAccessWrites.delete(guid);
    }
  }

  private extractToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
