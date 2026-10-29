import { Country } from '../common/domain/country';
import { UserRole } from '../common/interfaces/jwt-payload.interface';

/**
 * Catálogo de eventos que el navegador recibe al preguntar qué ha pasado (ver `RealtimeService`).
 *
 * Mantenerlo como unión de literales —y no como `string`— hace que un evento mal escrito
 * sea un error de compilación en lugar de un mensaje que nadie recibe. El mismo catálogo
 * está replicado en `apps/client/src/lib/realtime/events.ts`.
 */
export const REALTIME_EVENTS = [
  // Sesión
  'session:revoked',
  // Usuarios
  'user:created',
  'user:updated',
  'user:deleted',
  // Solicitudes de acceso y matrículas pedidas por otros sistemas
  'request:new',
  'request:resolved',
  'integration:changed',
  // Cursos
  'course:created',
  'course:updated',
  'course:deleted',
  'course:maintenance',
  'course:editing',
  'course:editing-released',
  'course:editing-sync',
  // Matrículas, entregas y cuestionarios
  'enrollment:changed',
  'submission:new',
  'submission:graded',
  'round:closed',
  'quiz:attempt-enabled',
  // Plataforma
  'config:updated',
  'presence:update',
  'presence:sync',
  'notification:new',
  'message:new',
  'message:read',
  'contact:updated',
  'certificate:new',
] as const;

export type EventName = (typeof REALTIME_EVENTS)[number];

/** Un evento tal como lo recibe el navegador. */
export interface EventMessage {
  event: EventName;
  data: unknown;
  ts: number;
}

/**
 * A quién va dirigido un evento.
 *
 * `country` es obligatorio en todos los destinos porque ningún evento debe cruzar de una
 * sede a otra: una publicación de curso en Colombia no puede provocar ni un refresco de
 * pantalla en México.
 */
export type EventDestination =
  /** A los usuarios indicados, siempre dentro de su sede. */
  | { type: 'users'; country: Country; guids: readonly string[] }
  /** A todos los conectados de un rol dentro de una sede. */
  | { type: 'role'; country: Country; role: UserRole }
  /** A todos los conectados de una sede. */
  | { type: 'country'; country: Country }
  /** A quien gestiona un curso: los administradores de la sede y los usuarios indicados. */
  | { type: 'staff'; country: Country; guids: readonly string[] };
