/**
 * Fechas en la hora de la sede.
 *
 * La base guarda en UTC. Los días de las gráficas deben ser los de la sede —un acceso a
 * las 23:30 en Ciudad de México es de ese día, no del siguiente—, y no los del servidor,
 * que en cPanel puede estar en cualquier zona.
 */

/**
 * Desfase de la zona frente a UTC en `instant`, como `+HH:MM`, que es lo que espera
 * `CONVERT_TZ`. Con una zona desconocida devuelve el del servidor.
 */
export function timeZoneOffset(timeZone: string, instant = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value;
    // "GMT-05:00", o "GMT" a secas en UTC.
    if (name?.startsWith('GMT')) return name.length > 3 ? name.slice(3) : '+00:00';
  } catch {
    // Zona mal escrita en la configuración: se sigue con la del servidor.
  }
  return serverOffset(instant);
}

/** Día `AAAA-MM-DD` de `instant` en la zona de la sede. */
export function dayInTimeZone(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(instant);
  }
}

function serverOffset(instant: Date): string {
  const minutes = -instant.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0');
  const remainder = String(Math.abs(minutes) % 60).padStart(2, '0');
  return `${sign}${hours}:${remainder}`;
}
