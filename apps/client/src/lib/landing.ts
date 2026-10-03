import { COUNTRY_INFO, type Country } from './country';

/**
 * Textos de relleno con los que se creaban las sedes. No son datos de nadie, así que una
 * portada que todavía los tenga no los publica.
 */
const PLACEHOLDERS = [
  /^\+\d{1,3} 000 000 0000$/,
  /^contacto\.[a-z]{2}@pesveducation\.com$/i,
  /^Actualiza esta dirección/i,
];

/**
 * Dato de contacto que se puede enseñar en la portada, o `null` si está vacío o sigue
 * siendo el de relleno. La oficina de serie era el nombre de la sede, que no es una
 * dirección.
 */
export function publicContact(value: string | null | undefined, country: Country): string | null {
  const text = value?.trim() ?? '';
  if (!text || text === COUNTRY_INFO[country].name) return null;
  return PLACEHOLDERS.some((pattern) => pattern.test(text)) ? null : text;
}
