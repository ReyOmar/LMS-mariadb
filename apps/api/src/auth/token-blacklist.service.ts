import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Vida máxima de un JWT. Una revocación deja de importar pasado ese plazo. */
export const VIDA_TOKEN_MS = 24 * 60 * 60 * 1000;

/** Margen sobre la vida del token antes de purgar una revocación. */
const MARGEN_PURGA_MS = 60 * 60 * 1000;

/** Cada cuánto se purgan las revocaciones caducadas. */
const INTERVALO_PURGA_MS = 60 * 60 * 1000;

/**
 * Revocación de tokens JWT.
 *
 * Un JWT es válido por sí mismo hasta que caduca, así que para invalidarlo antes hace
 * falta llevar una lista. Se guarda en base de datos y se cachea en memoria: la
 * comprobación ocurre en cada petición y no puede costar una consulta, pero un reinicio
 * del servidor tampoco puede devolver la validez a un token ya revocado —que es lo que
 * ocurría con la implementación anterior, puramente en memoria.
 *
 * Hay dos granularidades:
 *  - Por sesión (`jti`): cerrar sesión en un dispositivo no afecta a los demás.
 *  - Por usuario: cuenta borrada, desactivada o contraseña cambiada; cae todo.
 */
@Injectable()
export class TokenBlacklistService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenBlacklistService.name);

  /** Identificadores de sesión revocados. */
  private readonly sesionesRevocadas = new Set<string>();

  /** usuario → instante (ms) antes del cual todos sus tokens son inválidos. */
  private readonly usuariosRevocados = new Map<string, number>();

  private purga?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.cargarDesdeBaseDeDatos();
    this.purga = setInterval(() => void this.purgarCaducadas(), INTERVALO_PURGA_MS);
    this.purga.unref?.();
  }

  onModuleDestroy(): void {
    if (this.purga) clearInterval(this.purga);
  }

  /**
   * Invalida una sesión concreta. Es lo que hace «cerrar sesión»: el resto de dispositivos
   * del mismo usuario siguen conectados.
   */
  async revocarSesion(usuarioGuid: string, jti: string): Promise<void> {
    if (!jti) return;
    this.sesionesRevocadas.add(jti);

    await this.prisma.lms_token_revocations
      .upsert({
        where: { jti },
        create: { usuario_guid: usuarioGuid, jti, expires_at: this.caducidad() },
        update: { revoked_at: new Date(), expires_at: this.caducidad() },
      })
      .catch((error) => this.logger.error(`No se pudo persistir la revocación de sesión ${jti}`, error));
  }

  /**
   * Invalida todos los tokens del usuario emitidos hasta ahora.
   * Se usa al borrar o desactivar una cuenta y al cambiar la contraseña.
   */
  async revocarUsuario(usuarioGuid: string): Promise<void> {
    const ahora = Date.now();
    this.usuariosRevocados.set(usuarioGuid, ahora);

    await this.prisma.lms_token_revocations
      .create({
        data: { usuario_guid: usuarioGuid, jti: null, revoked_at: new Date(ahora), expires_at: this.caducidad(ahora) },
      })
      .catch((error) => this.logger.error(`No se pudo persistir la revocación de ${usuarioGuid}`, error));
  }

  /**
   * Indica si un token está revocado.
   * @param iat Claim `iat` del token, en segundos.
   */
  estaRevocado(usuarioGuid: string, jti: string | undefined, iat: number): boolean {
    if (jti && this.sesionesRevocadas.has(jti)) return true;

    const revocadoEn = this.usuariosRevocados.get(usuarioGuid);
    return revocadoEn !== undefined && iat * 1000 <= revocadoEn;
  }

  /** Reconstruye la caché desde la base de datos al arrancar. */
  private async cargarDesdeBaseDeDatos(): Promise<void> {
    try {
      const vigentes = await this.prisma.lms_token_revocations.findMany({
        where: { expires_at: { gt: new Date() } },
        select: { usuario_guid: true, jti: true, revoked_at: true },
      });

      for (const registro of vigentes) {
        if (registro.jti) {
          this.sesionesRevocadas.add(registro.jti);
          continue;
        }
        const previo = this.usuariosRevocados.get(registro.usuario_guid) ?? 0;
        this.usuariosRevocados.set(registro.usuario_guid, Math.max(previo, registro.revoked_at.getTime()));
      }

      this.logger.log(`Revocaciones vigentes cargadas: ${vigentes.length}`);
    } catch (error) {
      // Arrancar sin la caché es preferible a no arrancar; se registra para que se note.
      this.logger.error('No se pudieron cargar las revocaciones. Se continúa con la caché vacía.', error);
    }
  }

  /** Borra de la base y de la caché las revocaciones que ya no pueden afectar a ningún token. */
  private async purgarCaducadas(): Promise<void> {
    const ahora = new Date();
    try {
      const caducadas = await this.prisma.lms_token_revocations.findMany({
        where: { expires_at: { lte: ahora } },
        select: { usuario_guid: true, jti: true },
      });

      if (caducadas.length === 0) return;

      for (const registro of caducadas) {
        if (registro.jti) this.sesionesRevocadas.delete(registro.jti);
        else this.usuariosRevocados.delete(registro.usuario_guid);
      }

      await this.prisma.lms_token_revocations.deleteMany({ where: { expires_at: { lte: ahora } } });
      this.logger.log(`Revocaciones caducadas purgadas: ${caducadas.length}`);
    } catch (error) {
      this.logger.warn('No se pudieron purgar las revocaciones caducadas', error);
    }
  }

  private caducidad(desde = Date.now()): Date {
    return new Date(desde + VIDA_TOKEN_MS + MARGEN_PURGA_MS);
  }
}
