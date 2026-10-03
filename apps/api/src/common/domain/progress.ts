/**
 * Avance de un alumno: porcentajes enteros y tramos.
 *
 * Los redondeos se hacen con enteros para que JavaScript y las consultas SQL del
 * monitoreo den exactamente el mismo número: `Math.round(a / b * 100)` depende de cómo
 * represente la coma flotante cada división.
 */

/** Porcentaje entero de `part` sobre `total`, redondeado a la mitad hacia arriba. */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((200 * part + total) / (2 * total));
}

/** Media entera de varios porcentajes, con el mismo redondeo. */
export function roundedMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.floor((2 * sum + values.length) / (2 * values.length));
}

/** Índice del tramo de avance del monitoreo: 0–25, 26–50, 51–75 y 76–100. */
export function progressRange(value: number): number {
  if (value <= 25) return 0;
  if (value <= 50) return 1;
  if (value <= 75) return 2;
  return 3;
}
