import { Pais } from '../common/domain/pais';
import { RolUsuario } from '../common/interfaces/jwt-payload.interface';

/**
 * Catálogo de eventos que el servidor empuja al navegador.
 *
 * Mantenerlo como unión de literales —y no como `string`— hace que un evento mal escrito
 * sea un error de compilación en lugar de un mensaje que nadie recibe. El mismo catálogo
 * está replicado en `apps/client/src/lib/realtime/eventos.ts`.
 */
export const EVENTOS_REALTIME = [
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
  'dashboard:refresh',
  'notification:new',
  'message:new',
  'certificate:new',
] as const;

export type EventoRealtime = (typeof EVENTOS_REALTIME)[number];

/** Trama que viaja en cada `data:` del flujo SSE. */
export interface MensajeRealtime {
  event: EventoRealtime;
  data: unknown;
  ts: number;
}

/**
 * A quién va dirigido un evento.
 *
 * `pais` es obligatorio en todos los destinos porque ningún evento debe cruzar de una
 * sede a otra: una publicación de curso en Colombia no puede provocar ni un refresco de
 * pantalla en México.
 */
export type DestinoRealtime =
  /** A los usuarios indicados, siempre dentro de su sede. */
  | { tipo: 'usuarios'; pais: Pais; guids: readonly string[] }
  /** A todos los conectados de un rol dentro de una sede. */
  | { tipo: 'rol'; pais: Pais; rol: RolUsuario }
  /** A todos los conectados de una sede. */
  | { tipo: 'sede'; pais: Pais };
