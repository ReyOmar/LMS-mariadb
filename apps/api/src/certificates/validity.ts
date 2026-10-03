/**
 * Vigencia de un certificado.
 *
 * Una capacitación acredita durante un tiempo, no para siempre: quien vuelve a necesitarla
 * repite el curso y obtiene un certificado nuevo. Cada sede decide cuántos meses dura la
 * suya; sin ese ajuste, el certificado no caduca.
 *
 * Se mantiene aparte del servicio porque es aritmética de fechas pura: se puede comprobar
 * sin base de datos y sin montar nada.
 */

/**
 * Hasta cuándo acredita un certificado emitido en una fecha dada.
 * @returns `null` cuando la sede no declara vigencia, que significa «sin caducidad».
 */
export function computeValidUntil(issuedAt: Date, months: number | null | undefined): Date | null {
  if (!months || months <= 0) return null;

  const expiry = new Date(issuedAt);
  const originalDay = expiry.getDate();
  expiry.setMonth(expiry.getMonth() + Math.floor(months));

  // Sumar meses a un 31 puede saltar al mes siguiente —el 31 de enero más un mes sería el
  // 3 de marzo—; en ese caso se ajusta al último día del mes que corresponde.
  if (expiry.getDate() !== originalDay) expiry.setDate(0);

  return expiry;
}

/** Un certificado sin fecha de caducidad acredita siempre. */
export function isValid(validUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return !validUntil || validUntil.getTime() >= now.getTime();
}
