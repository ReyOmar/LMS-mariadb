/** Fragmento de un archivo, con los dos extremos incluidos, como los cuenta HTTP. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Interpreta la cabecera `Range` de una descarga contra el tamaño del archivo.
 *
 * Sólo se atiende un fragmento (`bytes=0-499`, `bytes=500-`, `bytes=-500`), que es lo que
 * piden los reproductores al saltar dentro de un vídeo y los navegadores al reanudar una
 * descarga. Varios fragmentos a la vez o una cabecera mal formada se ignoran y el archivo se
 * envía entero, como permite HTTP.
 *
 * @returns El fragmento que hay que enviar; `null` para enviar el archivo entero;
 *          `'unsatisfiable'` si el fragmento queda fuera del archivo (respuesta 416).
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match) return null;

  const [, first, last] = match;
  if (!first && !last) return null;

  // `bytes=-500`: los últimos 500 bytes.
  if (!first) {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(first);
  const end = last ? Number(last) : size - 1;
  if (last && end < start) return null;
  if (start >= size) return 'unsatisfiable';

  return { start, end: Math.min(end, size - 1) };
}
