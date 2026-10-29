import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Country } from '../common/domain/country';
import { JwtPayload, UserRole } from '../common/interfaces/jwt-payload.interface';
import { EventDestination, EventName, EventMessage } from './events';

/**
 * Cuánto se guarda cada evento: de sobra para la espera más larga entre dos consultas de una
 * pestaña, incluso en segundo plano. Quien tarde más recibe `reset` y vuelve a pedir sus datos.
 */
const RETENTION_MS = 3 * 60 * 1000;

/** Tope de eventos guardados, por si una ráfaga llegara antes de que caduquen. */
const MAX_LOGGED_EVENTS = 10_000;

/**
 * Sin preguntar en este tiempo, alguien deja de estar en línea. Holgado frente a la espera de
 * una pestaña en segundo plano (30 s), que el navegador puede alargar hasta un minuto.
 */
const PRESENCE_TIMEOUT_MS = 90_000;

/** Cada cuánto se repasa quién dejó de preguntar y se descartan los eventos caducados. */
const SWEEP_INTERVAL_MS = 15_000;

/** Lo que recibe el navegador en cada consulta. */
export interface EventBatch {
  /** Hasta dónde llega esta respuesta: la consulta siguiente lo envía en `after`. */
  cursor: number;
  /**
   * Si pudo perderse algún evento desde la consulta anterior —el proceso se reinició o pasó
   * demasiado tiempo—: llega el estado de ahora y el navegador vuelve a pedir sus datos.
   */
  reset: boolean;
  events: EventMessage[];
}

interface LoggedEvent {
  seq: number;
  target: EventDestination;
  message: EventMessage;
}

/** Quien ha preguntado hace poco: está en línea, y a quien se le reparten los eventos. */
interface Visitor {
  guid: string;
  country: Country;
  role: UserRole;
  seenAt: number;
}

/**
 * Tiempo real del LMS: cada navegador pregunta cada pocos segundos qué ha pasado desde su última
 * consulta, y el servidor guarda los eventos recientes para contestarle.
 *
 * No hay conexiones abiertas, a propósito. En cPanel, Apache no propaga los WebSockets, y con
 * CloudLinux cada petición en curso ocupa uno de los «procesos de entrada» de la cuenta (unos 20):
 * un flujo que se mantiene abierto (Server-Sent Events, *long polling*) ocupa uno por pestaña, y
 * con veinte pestañas abiertas Apache respondería 508 a todo el campus. Una consulta dura
 * milisegundos, así que cientos de personas caben de sobra.
 *
 * Todo envío exige un destino con país, y todo estado que se reparte —presencia y cursos en
 * edición— se filtra por país: nada cruza entre sedes.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly log: LoggedEvent[] = [];
  /**
   * Número del último evento. Empieza en el instante de arranque, así que un navegador que
   * pregunta con la marca de un proceso anterior siempre queda por detrás y recibe `reset`.
   */
  private lastSeq = Date.now();
  /** Los eventos hasta este número ya no se guardan: quien no los haya visto, recibe `reset`. */
  private discardedUpTo = this.lastSeq;
  private readonly visitors = new Map<string, Visitor>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  /**
   * courseGuid → quién lo está editando. Sólo tiene entradas de editores en línea: se vacía al
   * liberar el aviso o al dejar de estarlo quien lo tenía.
   */
  private readonly editsByCourse = new Map<string, CourseEdit>();

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  /**
   * Los eventos posteriores a `after` que le tocan a quien pregunta, que con ello queda en línea.
   * Sin `after` —la primera consulta— o si se perdió algo, el estado de ahora: quién está en línea
   * y cuáles de sus cursos se están editando.
   */
  poll(user: JwtPayload, after: number | null): EventBatch {
    const visitor = this.markSeen(user);
    const cursor = this.lastSeq;
    if (after !== null && after >= this.discardedUpTo && after <= cursor) {
      return { cursor, reset: false, events: this.eventsAfter(after, visitor) };
    }
    const now = Date.now();
    return {
      cursor,
      reset: after !== null,
      events: [
        { event: 'presence:sync', data: { onlineUsers: this.onlineUsers(user.country) }, ts: now },
        { event: 'course:editing-sync', data: this.editorsFor(visitor), ts: now },
      ],
    };
  }

  private eventsAfter(after: number, visitor: Visitor): EventMessage[] {
    const events: EventMessage[] = [];
    for (let i = this.log.length - 1; i >= 0 && this.log[i].seq > after; i--) {
      if (reaches(visitor, this.log[i].target)) events.push(this.log[i].message);
    }
    return events.reverse();
  }

  // ── Emisión ──────────────────────────────────────────────────────────────

  /** Guarda el evento para quienes pregunten. No lanza nunca: el tiempo real es accesorio. */
  private emit(event: EventName, data: unknown, target: EventDestination): void {
    this.log.push({ seq: ++this.lastSeq, target, message: { event, data, ts: Date.now() } });
    if (this.log.length > MAX_LOGGED_EVENTS) this.discard(this.log.length - MAX_LOGGED_EVENTS);
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

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Avisa al usuario de que su sesión dejó de ser válida, y deja de contarlo en línea. El
   * navegador vuelve al login con el motivo, que también recibe si su token ya no sirve: se lo
   * dice la respuesta 401 a su consulta.
   */
  revokeSession(guid: string, reason: RevocationReason): void {
    const visitor = this.visitors.get(guid);
    if (!visitor) return;
    this.emit('session:revoked', { reason }, { type: 'users', country: visitor.country, guids: [guid] });
    this.leave(visitor);
  }

  // ── Presencia ────────────────────────────────────────────────────────────

  private markSeen({ sub: guid, country, role }: JwtPayload): Visitor {
    const isNew = !this.visitors.has(guid);
    const visitor = { guid, country, role, seenAt: Date.now() };
    this.visitors.set(guid, visitor);
    if (isNew) this.announcePresence(country, guid, 'online');
    return visitor;
  }

  /** Deja de estar en línea: se anuncia y se liberan sus avisos de edición. */
  private leave(visitor: Visitor): void {
    this.visitors.delete(visitor.guid);
    this.releaseLocksHeldBy(visitor.guid);
    this.announcePresence(visitor.country, visitor.guid, 'offline');
  }

  /** GUID de los usuarios en línea en la sede indicada. */
  private onlineUsers(country: Country): string[] {
    return [...this.visitors.values()].filter((visitor) => visitor.country === country).map(({ guid }) => guid);
  }

  /** Sólo el cambio: la lista completa llega en `presence:sync`, con la primera consulta. */
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

  /** Cursos en edición que gestiona quien pregunta, como `courseGuid → editor`. */
  private editorsFor(visitor: Visitor): Record<string, CourseEditor> {
    return Object.fromEntries(
      [...this.editsByCourse]
        .filter(([, { editor, teacherGuid }]) =>
          reaches(visitor, { type: 'staff', country: editor.country, guids: [teacherGuid] }),
        )
        .map(([courseGuid, { editor }]) => [courseGuid, editor]),
    );
  }

  // ── Mantenimiento ────────────────────────────────────────────────────────

  /** Da por ido a quien dejó de preguntar y descarta los eventos caducados. */
  private sweep(): void {
    const now = Date.now();
    for (const visitor of this.visitors.values()) {
      if (now - visitor.seenAt > PRESENCE_TIMEOUT_MS) this.leave(visitor);
    }
    const kept = this.log.findIndex(({ message }) => now - message.ts <= RETENTION_MS);
    this.discard(kept === -1 ? this.log.length : kept);
  }

  /** Descarta los `count` eventos más antiguos. */
  private discard(count: number): void {
    if (count > 0) this.discardedUpTo = this.log.splice(0, count)[count - 1].seq;
  }
}

/** Si un evento con ese destino le toca a quien pregunta. */
function reaches(visitor: Visitor, target: EventDestination): boolean {
  if (visitor.country !== target.country) return false;
  switch (target.type) {
    case 'users':
      return target.guids.includes(visitor.guid);
    case 'role':
      return visitor.role === target.role;
    case 'country':
      return true;
    case 'staff':
      return visitor.role === 'ADMIN' || target.guids.includes(visitor.guid);
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
