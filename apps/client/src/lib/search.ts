/** Con menos caracteres el servidor no busca: una sola letra casa con casi toda la sede. */
export const MIN_SEARCH_LENGTH = 2;

/** Texto que se envía a una búsqueda del servidor; vacío mientras no llegue al mínimo. */
export function searchQuery(typed: string): string {
  const text = typed.trim();
  return text.length >= MIN_SEARCH_LENGTH ? text : '';
}

export function isSearchTooShort(typed: string): boolean {
  return typed.trim().length > 0 && searchQuery(typed) === '';
}
