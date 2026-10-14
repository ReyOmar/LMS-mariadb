/** Imagen de la marca y de los cursos: la portada del campus la enseña antes de iniciar sesión. */
const BRAND_FOLDERS = ['logos', 'portadas', 'fondos'] as const;

/** Van sin firma porque las piden el menú y el chat en un `<img>`, pero son datos personales. */
const PROFILE_FOLDERS = ['avatars'] as const;

const PUBLIC_FOLDERS = [...BRAND_FOLDERS, ...PROFILE_FOLDERS] as const;

/** Sólo se sirven con una URL firmada y caducable: una URL filtrada deja de funcionar sola. */
const RESERVED_FOLDERS = ['entregas', 'certificados', 'firmas', 'recursos'] as const;

export const FOLDERS = [...PUBLIC_FOLDERS, ...RESERVED_FOLDERS] as const;

export type Folder = (typeof FOLDERS)[number];

/** Donde sube directamente quien gestiona contenido; las entregas y las fotos tienen su propia ruta. */
export const UPLOAD_FOLDERS: readonly Folder[] = ['portadas', 'recursos', 'firmas', 'logos', 'fondos'];

/** Imágenes que un navegador enseña dentro de un `<img>`. */
const WEB_IMAGES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] as const;

/** Las únicas que el generador del certificado sabe incrustar en el PDF. */
export const PDF_IMAGES = ['.png', '.jpg', '.jpeg'] as const;

/**
 * Lo que puede entregar un alumno: nada que lleve código, como un SVG, que el examinador
 * abriría desde el campus. El cliente repite la lista en `components/assignments/allowed-files.ts`.
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

/** Formatos de cada carpeta acotada; las demás admiten cualquiera de los permitidos. */
export const FORMATS_BY_FOLDER: Readonly<Partial<Record<Folder, readonly string[]>>> = {
  // Se imprimen en el certificado, y el logotipo también va en los correos, que no muestran SVG.
  logos: PDF_IMAGES,
  firmas: PDF_IMAGES,
  // Se sirven sin firma desde el dominio del campus: con otros formatos serían un alojamiento gratis.
  portadas: WEB_IMAGES,
  fondos: WEB_IMAGES,
  avatars: WEB_IMAGES,
  entregas: SUBMISSION_FORMATS,
};

/** Sin separadores de ruta, caracteres de control ni punto inicial: ni `..` ni ficheros ocultos. */
const FILE_NAME = /^[^./\\:\p{Cc}][^/\\:\p{Cc}]*$/u;

export function isFolder(value: unknown): value is Folder {
  return typeof value === 'string' && (FOLDERS as readonly string[]).includes(value);
}

/**
 * Indica si un valor es exactamente `carpeta/nombre`, con una carpeta conocida. Toda clave pasa
 * por aquí antes de tocar el disco: una con `../` en una columna leería o borraría cualquier fichero.
 */
export function isStorageKey(value: unknown, allowedFolders?: readonly Folder[]): value is string {
  if (typeof value !== 'string') return false;

  const [folder, name, ...rest] = value.split('/');
  if (rest.length > 0 || !isFolder(folder) || !name || !FILE_NAME.test(name)) return false;

  return !allowedFolders || allowedFolders.includes(folder);
}

function folderOf(key: string): string {
  return key.split('/')[0];
}

/** Indica si la clave apunta a un archivo que puede servirse sin firma. */
export function isPublicKey(key: string): boolean {
  return (PUBLIC_FOLDERS as readonly string[]).includes(folderOf(key));
}

/** Indica si una caché compartida, como la de un proxy, puede guardar el archivo. */
export function isBrandKey(key: string): boolean {
  return (BRAND_FOLDERS as readonly string[]).includes(folderOf(key));
}
