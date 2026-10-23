/**
 * Pequeñas reglas de redacción que se repiten por todo el campus, para que la misma cosa
 * se escriba igual en todas las pantallas.
 */

/**
 * La palabra en singular o en plural según la cifra: `plural(1, 'intento', 'intentos')`
 * da «intento» y con cualquier otra cifra, cero incluido, «intentos».
 *
 * Devuelve sólo la palabra para que la cifra pueda escribirse con el formato de la sede.
 */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** Marcas diacríticas combinables (tildes, diéresis, la virgulilla de la ñ…). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Texto en minúsculas y sin tildes, que es como se comparan las búsquedas. */
function searchable(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * ¿Aparece cada palabra buscada dentro del texto, en cualquier orden? Igual que en las
 * búsquedas del servidor: sin distinguir tildes ni mayúsculas, para que «Díaz», «diaz» y
 * «DIAZ» coincidan. Una búsqueda vacía lo encuentra todo.
 */
export function matchesSearch(text: string, query: string): boolean {
  const haystack = searchable(text);
  return searchable(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/** Iniciales para el avatar de una persona: siempre en mayúscula, o `?` si no hay nombre. */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const letters = `${firstName?.trim().charAt(0) ?? ''}${lastName?.trim().charAt(0) ?? ''}`;
  return letters.toUpperCase() || '?';
}
