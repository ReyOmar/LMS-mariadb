/**
 * Catálogo de eventos que el servidor empuja al navegador.
 * Espejo de `apps/api/src/realtime/realtime.events.ts`: si uno cambia, el otro también.
 */
export const EVENTOS_REALTIME = [
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
  'dashboard:refresh',
  'notification:new',
  'message:new',
  'certificate:new',
] as const;

export type EventoRealtime = (typeof EVENTOS_REALTIME)[number];

/** Trama recibida por el flujo. */
export interface MensajeRealtime<T = unknown> {
  event: EventoRealtime;
  data: T;
  ts: number;
}

/** Quién está editando un curso, para avisar a otro editor antes de que pise el trabajo. */
export interface EditorDeCurso {
  guid: string;
  nombre: string;
  rol: string;
}

/** Motivo por el que el servidor cortó la sesión, traducido a algo que el usuario entiende. */
export const MENSAJE_POR_REVOCACION: Record<string, string> = {
  account_deleted: 'Tu cuenta ha sido eliminada.',
  account_disabled: 'Tu cuenta ha sido desactivada.',
  password_changed: 'Tu contraseña ha cambiado. Vuelve a iniciar sesión.',
  password_reset: 'Tu contraseña se restableció. Vuelve a iniciar sesión.',
};
