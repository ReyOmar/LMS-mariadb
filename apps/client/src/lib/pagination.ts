/**
 * Cómo se juntan las páginas de una lista que llega por tandas.
 *
 * Las listas largas del examinador se piden por páginas («Ver más») y, cuando llega un aviso
 * en tiempo real, se vuelve a pedir sólo la primera. Lo que se resuelve aquí es encajar esa
 * página con lo que ya estaba cargado sin perderlo ni repetir filas.
 *
 * Cada fila se reconoce por una clave, que por defecto es su `guid`. Cuando la página no
 * avanza por fila sino por otra unidad —los cuestionarios avanzan por alumno y de cada uno
 * llegan todos sus intentos— la clave es esa unidad: lo que trae la página de un alumno
 * sustituye todo lo que había de él, también los intentos que ya no existen.
 */

type KeyOf<T> = (item: T) => string;

const byGuid = <T extends { guid: string }>(item: T): string => item.guid;

/** Lo cargado sin las filas que vuelve a traer `page`, que es la versión al día. */
function withoutRowsOf<T>(loaded: T[], page: T[], keyOf: KeyOf<T>): T[] {
  const keys = new Set(page.map(keyOf));
  return loaded.filter((item) => !keys.has(keyOf(item)));
}

/**
 * Pone delante la primera página recién pedida y conserva lo que ya estaba cargado.
 *
 * Al llegar una entrega nueva se vuelve a pedir la primera página; si el examinador había
 * cargado más, reemplazar la lista entera le haría perder lo que estaba revisando. El cursor
 * de «Ver más» se deja como estaba: lo que sube a la primera página es lo más reciente y no
 * vuelve a caer detrás de él.
 *
 * Lo cargado que la página nueva no trae se queda como estaba, aunque haya dejado de cumplir
 * el filtro: desde aquí no se distingue de lo que sólo bajó a la página siguiente.
 */
export function mergeFirstPage<T extends { guid: string }>(fresh: T[], loaded: T[], keyOf: KeyOf<T> = byGuid): T[] {
  return [...fresh, ...withoutRowsOf(loaded, fresh, keyOf)];
}

/**
 * Añade la página siguiente detrás de lo cargado.
 *
 * Normalmente no trae nada repetido, pero una fila que bajó de sitio después de cargarse
 * —un alumno al que se le borró su intento más reciente— vuelve a llegar detrás del cursor.
 * Entonces se queda la versión de la página nueva, en lugar de enseñar dos veces lo mismo.
 */
export function appendPage<T extends { guid: string }>(loaded: T[], next: T[], keyOf: KeyOf<T> = byGuid): T[] {
  return [...withoutRowsOf(loaded, next, keyOf), ...next];
}
