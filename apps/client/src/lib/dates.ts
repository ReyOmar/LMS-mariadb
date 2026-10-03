/**
 * Fechas y horas tal y como se leen en el campus: un único idioma neutro y unos pocos
 * formatos con nombre, para que la misma fecha se lea igual en toda la aplicación.
 *
 * Se escriben en la hora de la sede, no en la del navegador: una entrega o un plazo se
 * leen igual desde cualquier equipo, y coinciden con lo que cuenta el servidor (días con
 * actividad, recordatorios). La zona la fija la configuración de la sede al cargarse
 * (`ConfigContext`); hasta entonces, o si no es válida, se usa la del navegador.
 */

/** Español neutro: vale para Colombia y para México, y no arrastra formatos de España. */
const LOCALE = 'es';

/** Lo que se escribe cuando no hay fecha. */
const NO_DATE = 'Sin fecha';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Zona horaria IANA de la sede; `undefined` deja la del navegador. */
let timeZone: string | undefined;

/** Fija la zona horaria de la sede. Una zona que el navegador no reconoce se ignora. */
export function setTimeZone(zone: string | null | undefined): void {
  timeZone = zone && isValidTimeZone(zone) ? zone : undefined;
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Acepta lo que llega de la API —cadena o `Date`— y descarta lo que no es una fecha. */
function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 22/09/2026 */
export function shortDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date
    ? date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone })
    : NO_DATE;
}

/** 22 de septiembre de 2026 */
export function longDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone }) : NO_DATE;
}

/** 14:05 */
export function shortTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone }) : NO_DATE;
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
        timeZone,
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
        timeZone,
      })
    : NO_DATE;
}

/** 22 sept, 14:05 — para listas de actividad, donde importa el día y la hora juntos. */
export function dateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date
    ? date.toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
    : NO_DATE;
}

/**
 * Día del calendario de la sede en que cae un instante. El mes empieza en 0, como en
 * `Date`, para usarlo directamente en un calendario.
 */
export function calendarDay(value: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((found) => found.type === type)?.value);
  return { year: part('year'), month: part('month') - 1, day: part('day') };
}

/** Número de día del calendario de la sede, para contar días enteros entre dos instantes. */
function dayNumber(value: Date): number {
  const { year, month, day } = calendarDay(value);
  return Date.UTC(year, month, day) / DAY;
}

/**
 * Marca de una conversación: la hora si es de hoy, «ayer», el día de la semana si es de
 * esta semana y el día y el mes si es más antigua. Es lo que se espera de un chat.
 *
 * Se cuentan días del calendario, no periodos de 24 horas: un mensaje de anoche es de
 * ayer aunque haya llegado hace menos de un día.
 */
export function conversationTimestamp(value: string | Date | null | undefined, now: number = Date.now()): string {
  const date = asDate(value);
  if (!date) return '';

  const days = dayNumber(new Date(now)) - dayNumber(date);

  if (days <= 0) return shortTime(date);
  if (days === 1) return 'ayer';
  if (days < 7) return date.toLocaleDateString(LOCALE, { weekday: 'short', timeZone });
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', timeZone });
}

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
