/**
 * Longitud mínima de una búsqueda que recorre muchas personas (candidatos del chat): una
 * sola letra casa con casi todo el mundo y cuesta lo mismo que la lista entera.
 */
export const MIN_SEARCH_LENGTH = 2;

/** Marcas diacríticas combinables (tildes, diéresis, la virgulilla de la ñ…). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Texto de búsqueda listo para `LIKE` o `contains`: sin espacios en los extremos, sin
 * tildes ni diéresis y con los comodines (`%`, `_`) y la barra escapados, para que se
 * busque exactamente lo escrito. Devuelve `undefined` si no queda nada que buscar.
 *
 * Quitar las tildes no cambia el resultado: las columnas usan `utf8mb4_unicode_ci`, que ya
 * compara sin distinguir tildes, mayúsculas ni ñ de n. Se descomponen las letras (NFD), se
 * quitan sólo las marcas y se vuelve a componer (NFC) para no alterar otros alfabetos.
 */
export function searchTerm(raw: string | undefined | null): string | undefined {
  const text = raw?.trim().normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
  return text ? text.replace(/[\\%_]/g, (char) => `\\${char}`) : undefined;
}
