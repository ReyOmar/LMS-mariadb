import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Writable } from 'stream';
import { Country } from '../common/domain/country';
import { JwtPayload, UserRole } from '../common/interfaces/jwt-payload.interface';
import { EventDestination, EventName, EventMessage } from './events';

/**
 * Intervalo del comentario de mantenimiento del flujo. Apache y los proxies intermedios
 * cierran conexiones inactivas; un `:ping` periódico las mantiene vivas y detecta de
 * inmediato los clientes que ya no están.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;

/** Conexiones simultáneas permitidas por usuario (pestañas abiertas). */
const MAX_CONNECTIONS_PER_USER = 5;

/**
 * Lo que se deja acumulado para un cliente que no lee (equipo suspendido, red caída sin
 * aviso) antes de cortarle el flujo. Sin tope crecería en memoria sin límite; al reconectar,
 * el cliente recupera el estado y vuelve a pedir sus datos.
 */
const MAX_UNSENT_BYTES = 1024 * 1024;

interface Connection {
  readonly id: number;
  readonly guid: string;
  readonly country: Country;
  readonly role: UserRole;
  readonly res: Writable;
}

/**
 * Tiempo real del LMS sobre Server-Sent Events.
 *
 * Se usa SSE y no WebSocket porque el despliegue vive en cPanel, donde Apache no propaga
 * la cabecera `Upgrade`. SSE es HTTP/1.1 corriente: atraviesa cualquier proxy inverso sin
 * configuración especial y trae reconexión en el propio protocolo.
 *
 * El flujo es unidireccional (servidor → navegador); lo que va en sentido contrario, como
 * el aviso de edición de un curso, son peticiones HTTP normales.
 *
 * Todo envío exige un destino con país, y todo estado que se reparte —presencia y cursos
 * en edición— se filtra por país: nada cruza entre sedes.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly connections = new Map<number, Connection>();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private nextId = 1;

  /**
   * courseGuid → quién lo está editando. Sólo tiene entradas de editores conectados: se
   * vacía al liberar el aviso o al cerrarse el último flujo de quien lo tenía.
   */
  private readonly editsByCourse = new Map<string, CourseEdit>();

  constructor() {
    this.heartbeat = setInterval(() => this.emitHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const connection of this.connections.values()) {
      this.close(connection);
    }
    this.connections.clear();
  }

  // ── Ciclo de vida de una conexión ────────────────────────────────────────

  /**
   * Da de alta un flujo SSE ya preparado por el controlador.
   * @returns Función para darlo de baja, que el controlador invoca al cerrarse la conexión.
   */
  register(user: JwtPayload, res: Writable): () => void {
    this.limitConnectionsFor(user.sub);

    const connection: Connection = {
      id: this.nextId++,
      guid: user.sub,
      country: user.country,
      role: user.role,
      res,
    };
    this.connections.set(connection.id, connection);

    // Estado inicial: quién está en línea y cuáles de sus cursos están siendo editados.
    this.sendTo(connection, {
      event: 'presence:sync',
      data: { onlineUsers: this.onlineUsers(user.country) },
      ts: Date.now(),
    });
    this.sendTo(connection, {
      event: 'course:editing-sync',
      data: this.editorsFor(connection),
      ts: Date.now(),
    });

    const wasFirstConnection = this.connectionsOf(user.sub).length === 1;
    if (wasFirstConnection) {
      this.announcePresence(user.country, user.sub, 'online');
    }

    return () => this.removeConnection(connection);
  }

  private removeConnection(connection: Connection): void {
    if (!this.connections.delete(connection.id)) return;

    const stillConnected = this.connectionsOf(connection.guid).length > 0;
    if (!stillConnected) {
      this.releaseLocksHeldBy(connection.guid);
      this.announcePresence(connection.country, connection.guid, 'offline');
    }
  }

  /**
   * Evita que una pestaña dejada abierta con recargas continuas acumule flujos muertos.
   * Cierra las más antiguas cuando se supera el límite, avisándolas para que no vuelvan a
   * conectarse solas: cada una echaría a otra y las pestañas se turnarían sin fin.
   */
  private limitConnectionsFor(guid: string): void {
    const ownConnections = this.connectionsOf(guid);
    if (ownConnections.length < MAX_CONNECTIONS_PER_USER) return;

    const excess = ownConnections.slice(0, ownConnections.length - MAX_CONNECTIONS_PER_USER + 1);
    for (const connection of excess) {
      this.sendTo(connection, { event: 'stream:superseded', data: null, ts: Date.now() });
      this.disconnect(connection);
    }
  }

  /**
   * Cierra un flujo desde el servidor. Pasa por `removeConnection` como un cierre del cliente,
   * para que al irse la última conexión se anuncie la desconexión y se liberen sus avisos de
   * edición: si no, la persona seguiría «en línea» y sus cursos «en edición» para siempre.
   */
  private disconnect(connection: Connection): void {
    this.removeConnection(connection);
    this.close(connection);
  }

  private connectionsOf(guid: string): Connection[] {
    return [...this.connections.values()].filter((connection) => connection.guid === guid);
  }

  // ── Emisión ──────────────────────────────────────────────────────────────

  /**
   * Envía un evento al destino indicado.
   *
   * No lanza nunca: el tiempo real es accesorio y un fallo de red en un cliente no puede
   * tumbar la operación de negocio que lo originó.
   */
  private emit(event: EventName, data: unknown, target: EventDestination): void {
    const message: EventMessage = { event, data, ts: Date.now() };
    for (const connection of this.connections.values()) {
      if (this.reaches(connection, target)) {
        this.sendTo(connection, message);
      }
    }
  }

  /** Atajo para el caso más común: avisar a usuarios concretos de una sede. */
  emitToUsers(event: EventName, data: unknown, country: Country, guids: readonly string[]): void {
    if (guids.length === 0) return;
    this.emit(event, data, { type: 'users', country, guids });
  }

  /** Atajo para avisar a todos los usuarios de un rol dentro de una sede. */
  emitToRole(event: EventName, data: unknown, country: Country, role: UserRole): void {
    this.emit(event, data, { type: 'role', country, role });
  }

  /** Avisa a quien gestiona un curso: los administradores de la sede y su examinador. */
  emitToCourseStaff(event: EventName, data: unknown, country: Country, teacherGuid: string): void {
    this.emit(event, data, { type: 'staff', country, guids: [teacherGuid] });
  }

  /** Atajo para avisar a toda una sede. */
  emitToCountry(event: EventName, data: unknown, country: Country): void {
    this.emit(event, data, { type: 'country', country });
  }

  private reaches(connection: Connection, target: EventDestination): boolean {
    if (connection.country !== target.country) return false;
    switch (target.type) {
      case 'users':
        return target.guids.includes(connection.guid);
      case 'role':
        return connection.role === target.role;
      case 'country':
        return true;
      case 'staff':
        return connection.role === 'ADMIN' || target.guids.includes(connection.guid);
    }
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Avisa al usuario de que su sesión dejó de ser válida y cierra sus flujos.
   * El navegador reacciona limpiando el almacenamiento y volviendo al login.
   */
  revokeSession(guid: string, reason: RevocationReason): void {
    for (const connection of this.connectionsOf(guid)) {
      this.sendTo(connection, { event: 'session:revoked', data: { reason }, ts: Date.now() });
      this.disconnect(connection);
    }
  }

  // ── Presencia ────────────────────────────────────────────────────────────

  /** GUID de los usuarios con al menos un flujo abierto en la sede indicada. */
  private onlineUsers(country: Country): string[] {
    const guids = new Set<string>();
    for (const connection of this.connections.values()) {
      if (connection.country === country) guids.add(connection.guid);
    }
    return [...guids];
  }

  /** Sólo el cambio: la lista completa llega una vez, en `presence:sync`, al conectar. */
  private announcePresence(country: Country, guid: string, status: 'online' | 'offline'): void {
    this.emitToCountry('presence:update', { guid, status }, country);
  }

  // ── Bloqueo de edición de cursos ─────────────────────────────────────────

  /**
   * Marca un curso como en edición para que otros administradores no lo abran a la vez.
   * Es un aviso cooperativo de interfaz, no un bloqueo de integridad: la consistencia real
   * la garantiza la regla de que un curso sólo se modifica en estado BORRADOR.
   *
   * Sólo le concierne al personal del curso: a los alumnos no se les dice qué se edita ni quién.
   */
  acquireCourseEdit(courseGuid: string, teacherGuid: string, editor: CourseEditor): CourseEditor {
    const current = this.editsByCourse.get(courseGuid);
    if (current && current.editor.guid !== editor.guid) return current.editor;

    this.editsByCourse.set(courseGuid, { editor, teacherGuid });
    this.emitToCourseStaff('course:editing', { courseGuid, editor }, editor.country, teacherGuid);
    return editor;
  }

  /** Libera el aviso de edición, sólo si lo tenía el usuario indicado. */
  releaseCourseLock(courseGuid: string, editorGuid: string): void {
    const current = this.editsByCourse.get(courseGuid);
    if (current?.editor.guid === editorGuid) this.release(courseGuid, current);
  }

  private releaseLocksHeldBy(guid: string): void {
    for (const [courseGuid, edit] of this.editsByCourse) {
      if (edit.editor.guid === guid) this.release(courseGuid, edit);
    }
  }

  private release(courseGuid: string, { editor, teacherGuid }: CourseEdit): void {
    this.editsByCourse.delete(courseGuid);
    this.emitToCourseStaff('course:editing-released', { courseGuid }, editor.country, teacherGuid);
  }

  /** Cursos en edición que gestiona quien se conecta, como `courseGuid → editor`. */
  private editorsFor(connection: Connection): Record<string, CourseEditor> {
    return Object.fromEntries(
      [...this.editsByCourse]
        .filter(([, { editor, teacherGuid }]) =>
          this.reaches(connection, { type: 'staff', country: editor.country, guids: [teacherGuid] }),
        )
        .map(([courseGuid, { editor }]) => [courseGuid, editor]),
    );
  }

  // ── Escritura en el flujo ────────────────────────────────────────────────

  private sendTo(connection: Connection, message: EventMessage): void {
    this.write(connection, `event: ${message.event}\ndata: ${JSON.stringify(message)}\n\n`);
  }

  private emitHeartbeat(): void {
    for (const connection of this.connections.values()) {
      this.write(connection, ': ping\n\n');
    }
  }

  private write(connection: Connection, chunk: string): void {
    const { res } = connection;
    if (res.writableEnded || res.writableLength > MAX_UNSENT_BYTES) {
      this.disconnect(connection);
      return;
    }
    try {
      res.write(chunk);
    } catch (error) {
      this.logger.debug(`Flujo SSE de ${connection.guid} no escribible: ${(error as Error)?.message}`);
      this.disconnect(connection);
    }
  }

  private close(connection: Connection): void {
    try {
      connection.res.end();
    } catch {
      // El socket ya estaba cerrado por el cliente; no hay nada que hacer.
    }
  }
}

/** Motivos por los que se corta una sesión; el cliente los traduce a un mensaje. */
export type RevocationReason =
  | 'account_deleted'
  | 'password_changed'
  | 'password_reset'
  /** Un administrador cambió su rol: las pantallas que tenía abiertas eran las del anterior. */
  | 'role_changed'
  /** Se inició sesión en otro dispositivo y el campus admite una sola a la vez. */
  | 'session_displaced';

export interface CourseEditor {
  guid: string;
  name: string;
  role: UserRole;
  country: Country;
}

/** Un curso en edición: quién lo edita y de quién es el curso, para avisar sólo a su personal. */
interface CourseEdit {
  editor: CourseEditor;
  teacherGuid: string;
}
