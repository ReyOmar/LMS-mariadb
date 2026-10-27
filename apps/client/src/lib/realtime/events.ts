import type { UserRole } from '@/types/models';

/**
 * Catálogo de eventos que el servidor empuja al navegador.
 * Espejo de `apps/api/src/realtime/events.ts`: si uno cambia, el otro también.
 */
export const REALTIME_EVENTS = [
  'session:revoked',
  'stream:superseded',
  'user:created',
  'user:updated',
  'user:deleted',
  'request:new',
  'request:resolved',
  'integration:changed',
  'course:created',
  'course:updated',
  'course:deleted',
  'course:maintenance',
  'course:editing',
  'course:editing-released',
  'course:editing-sync',
  'enrollment:changed',
  'submission:new',
  'submission:graded',
  'round:closed',
  'quiz:attempt-enabled',
  'config:updated',
  'presence:update',
  'presence:sync',
  'notification:new',
  'message:new',
  'message:read',
  'contact:updated',
  'certificate:new',
] as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];

/** Trama recibida por el flujo. */
export interface RealtimeMessage<T = unknown> {
  event: RealtimeEvent;
  data: T;
  ts: number;
}

/** Quién está editando un curso, para avisar a otro editor antes de que pise el trabajo. */
export interface CourseEditor {
  guid: string;
  name: string;
  role: UserRole;
}

/** Alguien abrió su primera pestaña del campus o cerró la última. */
export interface PresenceChange {
  guid: string;
  status: 'online' | 'offline';
}

/**
 * Quién está en línea tras un cambio de presencia. Devuelve el mismo conjunto si el cambio
 * no altera nada, para no repintar las listas que lo consultan.
 */
export function withPresence(online: ReadonlySet<string>, { guid, status }: PresenceChange): ReadonlySet<string> {
  if (online.has(guid) === (status === 'online')) return online;

  const next = new Set(online);
  if (status === 'online') next.add(guid);
  else next.delete(guid);
  return next;
}

/** Avisos sobre un alumno concreto: quien los escucha actualiza la fila de ese alumno. */
const PER_STUDENT_EVENTS: ReadonlySet<RealtimeEvent> = new Set(['round:closed']);

/**
 * Clave con la que se agrupan las ráfagas de un evento: el evento, el curso si es de un curso y
 * el alumno si es sobre uno. Sólo por evento, la baja en un curso y el alta en otro se fundirían
 * y la baja no llegaría; sólo por curso, de dos alumnos certificados a la vez se perdería uno.
 */
export function batchKey(event: RealtimeEvent, data: unknown): string {
  const payload = (data ?? {}) as { courseGuid?: unknown; guid?: unknown; userGuid?: unknown };
  const course = payload.courseGuid ?? (event.startsWith('course:') ? payload.guid : undefined);
  const student = PER_STUDENT_EVENTS.has(event) ? payload.userGuid : undefined;
  return [event, course, student].filter((part) => typeof part === 'string').join(':');
}
