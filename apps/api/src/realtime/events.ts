import { Country } from '../common/domain/country';
import { UserRole } from '../common/interfaces/jwt-payload.interface';

/**
 * Catálogo de eventos que el servidor empuja al navegador.
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
  // Solicitudes de acceso
  'request:new',
  'request:resolved',
  // Cursos
  'course:created',
  'course:updated',
  'course:deleted',
  'course:maintenance',
  'course:editing',
  'course:editing-released',
  'course:editing-sync',
  // Matrículas y entregas
  'enrollment:changed',
  'submission:new',
  'submission:graded',
  // Plataforma
  'config:updated',
  'presence:update',
  'presence:sync',
  'notification:new',
  'message:new',
  'certificate:new',
] as const;

export type EventName = (typeof REALTIME_EVENTS)[number];

/** Trama que viaja en cada `data:` del flujo SSE. */
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
