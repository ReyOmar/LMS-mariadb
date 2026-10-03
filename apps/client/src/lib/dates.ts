/**
 * Fechas y horas tal y como se leen en el campus: un único idioma neutro y unos pocos
 * formatos con nombre, para que la misma fecha se lea igual en toda la aplicación.
 */

/** Español neutro: vale para Colombia y para México, y no arrastra formatos de España. */
const LOCALE = 'es';

/** Lo que se escribe cuando no hay fecha. */
const NO_DATE = 'Sin fecha';

/** Acepta lo que llega de la API —cadena o `Date`— y descarta lo que no es una fecha. */
function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 22/09/2026 */
export function shortDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }) : NO_DATE;
}

/** 22 de septiembre de 2026 */
export function longDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : NO_DATE;
}

/** 14:05 */
export function shortTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : NO_DATE;
}

/** 22/09/2026, 14:05 */
export function shortDateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date
    ? date.toLocaleString(LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : NO_DATE;
}

/** lunes, 22 de septiembre de 2026, 14:05 — cuando la fecha es el dato principal. */
export function fullDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date
    ? date.toLocaleString(LOCALE, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : NO_DATE;
}

/** 22 sept, 14:05 — para listas de actividad, donde importa el día y la hora juntos. */
export function dateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date
    ? date.toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : NO_DATE;
}

/**
 * Marca de una conversación: la hora si es de hoy, el día de la semana si es de esta
 * semana, y el día y el mes si es más antigua. Es lo que se espera de un chat.
 */
export function conversationTimestamp(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';

  const elapsed = Date.now() - date.getTime();
  const ONE_DAY = 86_400_000;

  if (elapsed < ONE_DAY) return shortTime(date);
  if (elapsed < 7 * ONE_DAY) return date.toLocaleDateString(LOCALE, { weekday: 'short' });
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Cuánto hace de algo, en palabras: el último acceso de una cuenta, la llegada de un aviso…
 *
 * Se cuenta en relativo hasta la semana y en fecha completa a partir de ahí: «hace 3d»
 * sigue siendo útil, «hace 47d» no dice nada que una fecha no diga mejor.
 */
export function timeAgo(date: string | null | undefined, now: number = Date.now()): string | null {
  if (!date) return null;

  const instant = new Date(date);
  if (Number.isNaN(instant.getTime())) return null;

  const elapsed = now - instant.getTime();
  if (elapsed < MINUTE) return 'Hace un momento';
  if (elapsed < HOUR) return `Hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `Hace ${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `Hace ${Math.floor(elapsed / DAY)}d`;

  return shortDateTime(instant);
}
