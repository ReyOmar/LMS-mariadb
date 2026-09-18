import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ServerResponse } from 'http';
import { Pais } from '../common/domain/pais';
import { JwtPayload, RolUsuario } from '../common/interfaces/jwt-payload.interface';
import { DestinoRealtime, EventoRealtime, MensajeRealtime } from './realtime.events';

/**
 * Intervalo del comentario de mantenimiento del flujo. Apache y los proxies intermedios
 * cierran conexiones inactivas; un `:ping` periódico las mantiene vivas y detecta de
 * inmediato los clientes que ya no están.
 */
const INTERVALO_LATIDO_MS = 25_000;

/** Conexiones simultáneas permitidas por usuario (pestañas abiertas). */
const MAX_CONEXIONES_POR_USUARIO = 5;

interface Conexion {
  readonly id: number;
  readonly guid: string;
  readonly pais: Pais;
  readonly rol: RolUsuario;
  readonly res: ServerResponse;
}

/**
 * Tiempo real del LMS sobre Server-Sent Events.
 *
 * Se eligió SSE en lugar de WebSocket porque el despliegue vive en cPanel, donde Apache
 * no propaga la cabecera `Upgrade` y la conexión WebSocket nunca llega a establecerse.
 * SSE es HTTP/1.1 corriente: atraviesa cualquier proxy inverso sin configuración especial
 * y trae reconexión en el propio protocolo.
 *
 * El flujo es unidireccional (servidor → navegador), que es todo lo que el sistema
 * necesita. La única acción que iba en sentido contrario —el bloqueo de edición de un
 * curso— es ahora una petición HTTP normal (`POST /realtime/cursos/:guid/bloqueo`).
 *
 * Todo envío exige un destino con país: ningún evento cruza entre sedes.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly conexiones = new Map<number, Conexion>();
  private readonly latido: ReturnType<typeof setInterval>;
  private siguienteId = 1;

  /** curso_guid → quién lo está editando. Se reconstruye solo al reconectar los clientes. */
  private readonly editoresPorCurso = new Map<string, EditorDeCurso>();

  constructor() {
    this.latido = setInterval(() => this.emitirLatido(), INTERVALO_LATIDO_MS);
    this.latido.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.latido);
    for (const conexion of this.conexiones.values()) {
      this.cerrar(conexion);
    }
    this.conexiones.clear();
  }

  // ── Ciclo de vida de una conexión ────────────────────────────────────────

  /**
   * Da de alta un flujo SSE ya preparado por el controlador.
   * @returns Función para darlo de baja, que el controlador invoca al cerrarse la conexión.
   */
  registrar(usuario: JwtPayload, res: ServerResponse): () => void {
    this.limitarConexionesDe(usuario.sub);

    const conexion: Conexion = {
      id: this.siguienteId++,
      guid: usuario.sub,
      pais: usuario.pais,
      rol: usuario.role,
      res,
    };
    this.conexiones.set(conexion.id, conexion);

    // Estado inicial: quién está en línea y qué cursos están siendo editados.
    this.enviarA(conexion, { event: 'presence:sync', data: { onlineUsers: this.enLinea(usuario.pais) }, ts: Date.now() });
    this.enviarA(conexion, {
      event: 'course:editing-sync',
      data: Object.fromEntries(this.editoresPorCurso),
      ts: Date.now(),
    });

    const eraPrimeraConexion = this.conexionesDe(usuario.sub).length === 1;
    if (eraPrimeraConexion) {
      this.anunciarPresencia(usuario.pais, usuario.sub, 'online');
    }

    return () => this.darDeBaja(conexion);
  }

  private darDeBaja(conexion: Conexion): void {
    if (!this.conexiones.delete(conexion.id)) return;

    const sigueConectado = this.conexionesDe(conexion.guid).length > 0;
    if (!sigueConectado) {
      this.liberarCursosDe(conexion.guid);
      this.anunciarPresencia(conexion.pais, conexion.guid, 'offline');
    }
  }

  /**
   * Evita que una pestaña dejada abierta con recargas continuas acumule flujos muertos.
   * Cierra las más antiguas cuando se supera el límite.
   */
  private limitarConexionesDe(guid: string): void {
    const propias = this.conexionesDe(guid);
    if (propias.length < MAX_CONEXIONES_POR_USUARIO) return;

    const sobrantes = propias.slice(0, propias.length - MAX_CONEXIONES_POR_USUARIO + 1);
    for (const conexion of sobrantes) {
      this.conexiones.delete(conexion.id);
      this.cerrar(conexion);
    }
  }

  private conexionesDe(guid: string): Conexion[] {
    return [...this.conexiones.values()].filter((c) => c.guid === guid);
  }

  // ── Emisión ──────────────────────────────────────────────────────────────

  /**
   * Envía un evento al destino indicado.
   *
   * No lanza nunca: el tiempo real es accesorio y un fallo de red en un cliente no puede
   * tumbar la operación de negocio que lo originó.
   */
  emitir(evento: EventoRealtime, datos: unknown, destino: DestinoRealtime): void {
    const mensaje: MensajeRealtime = { event: evento, data: datos, ts: Date.now() };
    for (const conexion of this.conexiones.values()) {
      if (this.alcanza(conexion, destino)) {
        this.enviarA(conexion, mensaje);
      }
    }
  }

  /** Atajo para el caso más común: avisar a usuarios concretos de una sede. */
  emitirAUsuarios(evento: EventoRealtime, datos: unknown, pais: Pais, guids: readonly string[]): void {
    if (guids.length === 0) return;
    this.emitir(evento, datos, { tipo: 'usuarios', pais, guids });
  }

  /** Atajo para avisar a todos los usuarios de un rol dentro de una sede. */
  emitirARol(evento: EventoRealtime, datos: unknown, pais: Pais, rol: RolUsuario): void {
    this.emitir(evento, datos, { tipo: 'rol', pais, rol });
  }

  /** Atajo para avisar a toda una sede. */
  emitirASede(evento: EventoRealtime, datos: unknown, pais: Pais): void {
    this.emitir(evento, datos, { tipo: 'sede', pais });
  }

  private alcanza(conexion: Conexion, destino: DestinoRealtime): boolean {
    if (conexion.pais !== destino.pais) return false;
    switch (destino.tipo) {
      case 'usuarios':
        return destino.guids.includes(conexion.guid);
      case 'rol':
        return conexion.rol === destino.rol;
      case 'sede':
        return true;
    }
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Avisa al usuario de que su sesión dejó de ser válida y cierra sus flujos.
   * El navegador reacciona limpiando el almacenamiento y volviendo al login.
   */
  revocarSesion(guid: string, motivo: MotivoRevocacion): void {
    for (const conexion of this.conexionesDe(guid)) {
      this.enviarA(conexion, { event: 'session:revoked', data: { reason: motivo }, ts: Date.now() });
      this.conexiones.delete(conexion.id);
      this.cerrar(conexion);
    }
  }

  // ── Presencia ────────────────────────────────────────────────────────────

  /** GUID de los usuarios con al menos un flujo abierto en la sede indicada. */
  enLinea(pais: Pais): string[] {
    const guids = new Set<string>();
    for (const conexion of this.conexiones.values()) {
      if (conexion.pais === pais) guids.add(conexion.guid);
    }
    return [...guids];
  }

  private anunciarPresencia(pais: Pais, guid: string, estado: 'online' | 'offline'): void {
    this.emitirASede('presence:update', { guid, status: estado, onlineUsers: this.enLinea(pais) }, pais);
  }

  // ── Bloqueo de edición de cursos ─────────────────────────────────────────

  /**
   * Marca un curso como en edición para que otros administradores no lo abran a la vez.
   * Es un aviso cooperativo de interfaz, no un bloqueo de integridad: la consistencia real
   * la garantiza la regla de que un curso sólo se modifica en estado BORRADOR.
   */
  tomarEdicionDeCurso(cursoGuid: string, editor: EditorDeCurso, pais: Pais): EditorDeCurso {
    const actual = this.editoresPorCurso.get(cursoGuid);
    if (actual && actual.guid !== editor.guid) return actual;

    this.editoresPorCurso.set(cursoGuid, editor);
    this.emitirASede('course:editing', { curso_guid: cursoGuid, editor }, pais);
    return editor;
  }

  /** Libera el aviso de edición si lo tenía el usuario indicado (o sin condición si se omite). */
  liberarEdicionDeCurso(cursoGuid: string, pais: Pais, soloSiEs?: string): void {
    const actual = this.editoresPorCurso.get(cursoGuid);
    if (!actual) return;
    if (soloSiEs && actual.guid !== soloSiEs) return;

    this.editoresPorCurso.delete(cursoGuid);
    this.emitirASede('course:editing-released', { curso_guid: cursoGuid }, pais);
  }

  private liberarCursosDe(guid: string): void {
    for (const [cursoGuid, editor] of this.editoresPorCurso) {
      if (editor.guid !== guid) continue;
      this.editoresPorCurso.delete(cursoGuid);
      this.emitirASede('course:editing-released', { curso_guid: cursoGuid }, editor.pais);
    }
  }

  // ── Escritura en el flujo ────────────────────────────────────────────────

  private enviarA(conexion: Conexion, mensaje: MensajeRealtime): void {
    try {
      if (conexion.res.writableEnded) {
        this.darDeBaja(conexion);
        return;
      }
      conexion.res.write(`event: ${mensaje.event}\ndata: ${JSON.stringify(mensaje)}\n\n`);
    } catch (error) {
      this.logger.debug(`Flujo SSE de ${conexion.guid} no escribible: ${(error as Error)?.message}`);
      this.darDeBaja(conexion);
    }
  }

  private emitirLatido(): void {
    for (const conexion of this.conexiones.values()) {
      try {
        if (conexion.res.writableEnded) {
          this.darDeBaja(conexion);
          continue;
        }
        conexion.res.write(': ping\n\n');
      } catch {
        this.darDeBaja(conexion);
      }
    }
  }

  private cerrar(conexion: Conexion): void {
    try {
      conexion.res.end();
    } catch {
      // El socket ya estaba cerrado por el cliente; no hay nada que hacer.
    }
  }
}

/** Motivos por los que se corta una sesión; el cliente los traduce a un mensaje. */
export type MotivoRevocacion =
  | 'account_deleted'
  | 'account_disabled'
  | 'password_changed'
  | 'password_reset'
  /** Se inició sesión en otro dispositivo y el campus admite una sola a la vez. */
  | 'sesion_desplazada';

export interface EditorDeCurso {
  guid: string;
  nombre: string;
  rol: string;
  pais: Pais;
}
