/**
 * Clasificación de los archivos del LMS por sensibilidad.
 *
 *  - PÚBLICOS: material de marca que la portada necesita antes de iniciar sesión.
 *  - RESERVADOS: todo lo demás, que sólo se sirve con una URL firmada y caducable, para que
 *    una URL filtrada en un historial, un proxy o una captura deje de funcionar sola.
 */

/** Archivos que cualquiera puede pedir: son parte de la identidad visual del sitio. */
const PUBLIC_FOLDERS = ['logos', 'portadas', 'fondos', 'avatars'] as const;

/** Archivos que exigen una URL firmada por la API. */
const RESERVED_FOLDERS = ['entregas', 'certificados', 'firmas', 'recursos'] as const;

const FOLDERS = [...PUBLIC_FOLDERS, ...RESERVED_FOLDERS] as const;

export type Folder = (typeof FOLDERS)[number];

/** Imágenes que un navegador enseña dentro de un `<img>`. */
const WEB_IMAGES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] as const;

/** Las únicas que el generador del certificado sabe incrustar en el PDF. */
const PDF_IMAGES = ['.png', '.jpg', '.jpeg'] as const;

/**
 * Lo que puede entregar un alumno. Es la misma lista que ofrece el cliente
 * (`apps/client/src/components/assignments/allowed-files.ts`).
 */
const SUBMISSION_FORMATS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.zip',
  '.rar',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.mp3',
] as const;

/**
 * Formatos que admite cada carpeta acotada; las demás aceptan cualquier formato permitido.
 *
 * Las carpetas públicas se sirven sin firma desde el dominio del campus: si admitieran un
 * PDF o un vídeo, serían un alojamiento de archivos gratis para cualquiera con sesión. Una
 * firma que el PDF no sabe leer desaparecería de todos los certificados. Y una entrega en
 * SVG llevaría código que el examinador abriría desde el campus.
 */
export const FORMATS_BY_FOLDER: Readonly<Partial<Record<Folder, readonly string[]>>> = {
  logos: WEB_IMAGES,
  portadas: WEB_IMAGES,
  fondos: WEB_IMAGES,
  avatars: WEB_IMAGES,
  firmas: PDF_IMAGES,
  entregas: SUBMISSION_FORMATS,
};

/**
 * Nombre de archivo admitido dentro de una carpeta: sin separadores de ruta ni caracteres
 * de control y sin punto inicial, de modo que no hay forma de escribir `..` ni un fichero
 * oculto.
 */
const FILE_NAME = /^[^./\\:\p{Cc}][^/\\:\p{Cc}]*$/u;

export function isFolder(value: unknown): value is Folder {
  return typeof value === 'string' && (FOLDERS as readonly string[]).includes(value);
}

/**
 * Indica si un valor tiene la forma de una clave de almacenamiento: exactamente
 * `carpeta/nombre`, con una carpeta conocida.
 *
 * Toda clave que llega al disco o al bucket pasa por aquí, venga de la URL o de la base de
 * datos: una clave con `../` escrita en una columna bastaría para leer o borrar cualquier
 * fichero del servidor.
 */
export function isStorageKey(value: unknown, allowedFolders?: readonly Folder[]): value is string {
  if (typeof value !== 'string') return false;

  const [folder, name, ...rest] = value.split('/');
  if (rest.length > 0 || !isFolder(folder) || !name || !FILE_NAME.test(name)) return false;

  return !allowedFolders || allowedFolders.includes(folder);
}

/** Indica si la clave apunta a un archivo que puede servirse sin firma. */
export function isPublicKey(key: string): boolean {
  const folder = key.split('/')[0];
  return (PUBLIC_FOLDERS as readonly string[]).includes(folder);
}
