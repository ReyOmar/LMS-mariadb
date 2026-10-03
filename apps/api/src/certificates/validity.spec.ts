import { isValid, computeValidUntil } from './validity';

/**
 * Vigencia de un certificado.
 *
 * Aritmética de fechas: el terreno donde los errores no se ven hasta que alguien presenta
 * un documento y le dicen que está vencido. Los casos que importan son los bordes de mes,
 * porque sumar meses a un día 31 no cae donde uno espera.
 */

const january31 = new Date('2026-01-31T10:00:00Z');

describe('computeValidUntil', () => {
  it('suma los meses declarados por la sede', () => {
    const expiry = computeValidUntil(new Date('2026-03-15T10:00:00Z'), 24);

    expect(expiry?.toISOString().slice(0, 10)).toBe('2028-03-15');
  });

  it('sin vigencia declarada, el certificado no caduca', () => {
    expect(computeValidUntil(january31, null)).toBeNull();
    expect(computeValidUntil(january31, undefined)).toBeNull();
    expect(computeValidUntil(january31, 0)).toBeNull();
  });

  it('no se desborda al mes siguiente desde un día 31', () => {
    // Sumar un mes al 31 de enero daría el 3 de marzo si se dejara pasar: se ajusta al
    // último día de febrero, que es lo que entiende cualquiera por «un mes después».
    const expiry = computeValidUntil(january31, 1);

    expect(expiry?.getMonth()).toBe(1); // febrero
    expect(expiry?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('respeta los años bisiestos', () => {
    const expiry = computeValidUntil(new Date('2028-01-31T10:00:00Z'), 1);

    expect(expiry?.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('no modifica la fecha de emisión que recibe', () => {
    const issued = new Date('2026-05-10T10:00:00Z');
    computeValidUntil(issued, 12);

    expect(issued.toISOString()).toBe('2026-05-10T10:00:00.000Z');
  });
});

describe('isValid', () => {
  const expiry = new Date('2026-06-30T23:59:00Z');

  it('vale hasta el último instante del plazo', () => {
    expect(isValid(expiry, new Date('2026-06-30T23:58:00Z'))).toBe(true);
    expect(isValid(expiry, expiry)).toBe(true);
  });

  it('deja de valer pasado el plazo', () => {
    expect(isValid(expiry, new Date('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('sin plazo, acredita siempre', () => {
    expect(isValid(null, new Date('2099-01-01T00:00:00Z'))).toBe(true);
    expect(isValid(undefined)).toBe(true);
  });
});
