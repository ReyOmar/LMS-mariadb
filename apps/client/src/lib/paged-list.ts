import { mergeFirstPage } from './pagination';

/** Una tanda de la lista y por dónde sigue la siguiente (`null`: no hay más). */
export interface Page<T> {
  items: T[];
  cursor: string | null;
}

/**
 * Lo que queda a la vista al volver a pedir la primera página: sin más páginas, la primera es la
 * lista entera y la sustituye; si no, se funde con lo cargado y conserva el cursor de «Ver más».
 */
export function refreshedPage<T extends { guid: string }>(loaded: Page<T>, fresh: Page<T>): Page<T> {
  if (fresh.cursor === null) return fresh;
  return { items: mergeFirstPage(fresh.items, loaded.items), cursor: loaded.cursor };
}
