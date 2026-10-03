import { Transform } from 'class-transformer';

/** Quita los espacios de los extremos de un texto. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Un correo se compara siempre sin espacios y en minúsculas. */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** Un campo opcional que se deja vacío en un formulario se guarda como «sin valor». */
export const EmptyToNull = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));
