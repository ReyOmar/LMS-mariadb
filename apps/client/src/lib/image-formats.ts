import type { ImageFolder } from './upload-limits';

const FORMAT_NAME: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'image/svg+xml': 'SVG',
};

/** Las únicas que el certificado sabe incrustar y que se ven en cualquier gestor de correo. */
const PRINTABLE = ['image/png', 'image/jpeg'];
const WEB = [...PRINTABLE, 'image/gif', 'image/webp', 'image/svg+xml'];

/** Espejo de `FORMATS_BY_FOLDER` de la API (`apps/api/src/storage/folders.ts`). */
const FORMATS_BY_FOLDER: Record<ImageFolder, readonly string[]> = {
  logos: PRINTABLE,
  firmas: PRINTABLE,
  portadas: WEB,
  fondos: WEB,
  avatars: WEB,
};

/** Valor del atributo `accept` del selector de archivos de una carpeta. */
export function imageAccept(folder: ImageFolder): string {
  return FORMATS_BY_FOLDER[folder].join(',');
}

/** Los formatos de una carpeta tal como se nombran en pantalla: «PNG o JPG». */
export function imageFormatNames(folder: ImageFolder): string {
  const names = FORMATS_BY_FOLDER[folder].map((type) => FORMAT_NAME[type]);
  return new Intl.ListFormat('es', { type: 'disjunction' }).format(names);
}

/** Comprueba el formato antes de subir nada. Devuelve el aviso, o `null` si vale. */
export function imageFormatWarning(file: { type: string }, folder: ImageFolder): string | null {
  if (FORMATS_BY_FOLDER[folder].includes(file.type)) return null;
  return `Aquí sólo se admiten imágenes ${imageFormatNames(folder)}.`;
}
