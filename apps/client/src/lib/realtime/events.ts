import type { UserRole } from '@/types/models';

/**
 * Catálogo de eventos que el servidor empuja al navegador.
 * Espejo de `apps/api/src/realtime/events.ts`: si uno cambia, el otro también.
 */
export const REALTIME_EVENTS = [
  'session:revoked',
  'user:created',
  'user:updated',
  'user:deleted',
  'request:new',
  'request:resolved',
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
  'config:updated',
  'presence:update',
  'presence:sync',
  'notification:new',
  'message:new',
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
