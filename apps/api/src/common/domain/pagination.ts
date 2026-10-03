/**
 * Paginación por marca: cada página arranca justo donde terminó la anterior.
 *
 * Con `OFFSET` la base lee y descarta todas las filas saltadas, de modo que la página 300
 * cuesta trescientas veces la primera. Partiendo de una marca de la última fila entregada
 * el coste es el mismo siempre. A cambio exige dos cosas: un orden total —fecha *y*
 * identificador, porque dos filas pueden compartir fecha— y un índice con ese mismo orden.
 */

/** Filas que devuelve una página si no se pide otra cosa. */
export const ROWS_PER_PAGE = 50;

/** Tope por petición: impide que alguien se lleve la sede entera de una vez. */
export const MAX_PER_PAGE = 200;

/** Última fila entregada. Es por donde sigue la página siguiente. */
export interface Cursor {
  date: Date;
  id: string;
}

/** Acota lo que pide el cliente al rango permitido. */
export function rowsPerPage(limit?: number): number {
  return Math.min(Math.max(limit ?? ROWS_PER_PAGE, 1), MAX_PER_PAGE);
}

/** La marca viaja en un solo parámetro y opaca, para que nadie la construya a mano. */
export function encodeCursor(date: Date, id: string | number): string {
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64url');
}

/**
 * Lee la marca recibida. Devuelve `null` si no viene o si viene rota, de forma que el
 * listado responde con la primera página en lugar de con un error: una marca inválida es
 * un fallo del cliente, no algo que deba dejar la pantalla en blanco.
 */
export function decodeCursor(cursor?: string | null): Cursor | null {
  if (!cursor) return null;

  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const cutoff = text.indexOf('|');
  if (cutoff < 1) return null;

  const date = new Date(text.slice(0, cutoff));
  const id = text.slice(cutoff + 1);
  if (Number.isNaN(date.getTime()) || !id) return null;

  return { date, id };
}
