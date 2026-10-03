import { Transform } from 'class-transformer';

/** Quita los espacios de los extremos de un texto. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Un correo se compara siempre sin espacios y en minúsculas. */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** Un campo opcional que se deja vacío en un formulario se guarda como «sin valor». */
export const EmptyToNull = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

/**
 * Booleano estricto: sólo admite `true`, `false` y sus formas de texto `'true'` y `'false'`
 * (las que llegan en una consulta o un formulario).
 *
 * La conversión implícita de la validación global convierte cualquier texto no vacío en
 * `true` —«false» incluido—, así que se parte del valor recibido y no del ya convertido.
 * Cualquier otro valor se deja tal cual para que `@IsBoolean` lo rechace.
 */
export const StrictBoolean = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const received = obj[key];
    if (received === 'true') return true;
    if (received === 'false') return false;
    return received;
  });
