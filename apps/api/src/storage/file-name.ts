import * as path from 'path';

/** Lo que cabe en las columnas que guardan el nombre original de un archivo. */
export const MAX_FILE_NAME_LENGTH = 191;

/** Más que esto no es una extensión, sino un nombre con un punto dentro. */
const MAX_EXTENSION_LENGTH = 16;

/**
 * Recorta un nombre de archivo para que quepa en la base de datos sin perder la extensión,
 * que es lo que decide cómo se abre al descargarlo.
 *
 * Cuenta caracteres y no unidades UTF-16: un emoji del nombre no se parte por la mitad.
 */
export function shortenFileName(name: string, max: number = MAX_FILE_NAME_LENGTH): string {
  const characters = Array.from(name);
  if (characters.length <= max) return name;

  const extension = path.extname(name);
  const keep = extension.length <= MAX_EXTENSION_LENGTH ? extension : '';
  const base = Array.from(name.slice(0, name.length - keep.length));

  return `${base.slice(0, max - Array.from(keep).length).join('')}${keep}`;
}
