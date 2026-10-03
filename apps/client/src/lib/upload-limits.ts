/**
 * Límites de subida de archivos, con la misma regla y los mismos mensajes que la API
 * (`apps/api/src/storage/upload-limits.ts`).
 *
 * El servidor es quien decide; esto sólo avisa antes de enviar nada, para que nadie espere
 * a subir 800 MB para leer que la tarea admitía 10.
 */

/** Un MB, en bytes. */
export const MIB = 1024 * 1024;

/** Topes fijos de las imágenes: logotipos, fondos, portadas, fotos y firmas. */
export const IMAGE_LIMITS_MB = {
  logos: 5,
  portadas: 5,
  fondos: 10,
  avatars: 5,
  firmas: 2,
} as const;

export type ImageFolder = keyof typeof IMAGE_LIMITS_MB;

/** Destino de la subida: una carpeta de imágenes, la entrega de una tarea o material de curso. */
export type UploadFolder = ImageFolder | 'entregas' | 'recursos';

/** Tope aplicable a una subida y el mensaje con el que se rechaza lo que lo supere. */
export interface UploadLimit {
  readonly maxMb: number;
  readonly message: string;
}

function isImageFolder(folder: UploadFolder): folder is ImageFolder {
  return folder in IMAGE_LIMITS_MB;
}

function positive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** `1024` → «1 GB»; `10` → «10 MB». */
export function formatMb(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

function tooLargeMessage(folder: UploadFolder, mb: number): string {
  const limit = formatMb(mb);
  if (isImageFolder(folder)) return `La imagen supera el límite de ${limit}.`;
  if (folder === 'entregas') return `El archivo supera el límite de ${limit} de esta tarea.`;
  return `El archivo supera el límite de ${limit} configurado para la sede.`;
}

/**
 * Límite exacto de una subida.
 *
 *  - Imágenes: su tope fijo.
 *  - Entrega de una tarea: el de la tarea o, si no tiene, el general de la sede.
 *  - Material de curso: el general de la sede.
 *
 * Nada supera el tope técnico del servidor (`uploadCeilingMb` de la configuración).
 *
 * @returns `null` mientras no se conozca el límite —la configuración de la sede aún no ha
 *          llegado—: mejor no avisar que avisar con un valor inventado.
 */
export function uploadLimit(
  folder: UploadFolder,
  configuredMb?: number | null,
  ceilingMb?: number | null,
): UploadLimit | null {
  const base = isImageFolder(folder) ? IMAGE_LIMITS_MB[folder] : positive(configuredMb);
  if (base === undefined) return null;

  const ceiling = positive(ceilingMb);
  const maxMb = ceiling === undefined ? base : Math.min(base, ceiling);
  return { maxMb, message: tooLargeMessage(folder, maxMb) };
}

/** Límite de la entrega de una tarea: el suyo propio o, sin él, el general de la sede. */
export function submissionLimit(
  assignmentMb: number | null | undefined,
  siteMb: number | null | undefined,
  ceilingMb: number | null | undefined,
): UploadLimit | null {
  return uploadLimit('entregas', positive(assignmentMb) ?? siteMb, ceilingMb);
}

/** Comprueba el peso antes de enviar nada. Devuelve el aviso, o `null` si cabe. */
export function fileSizeWarning(file: { size: number }, limit: UploadLimit | null | undefined): string | null {
  if (!limit || file.size <= limit.maxMb * MIB) return null;
  return limit.message;
}

/**
 * Lee un límite escrito en un formulario: un entero de MB entre 1 y el tope técnico.
 *
 * @param required Si es falso, dejarlo vacío es válido y vale `null` (en una tarea,
 *        «usar el límite general de la sede»).
 */
export function parseLimitMb(
  text: string,
  ceilingMb: number | null | undefined,
  required = false,
): { value: number | null; error: string | null } {
  const trimmed = text.trim();
  const ceiling = positive(ceilingMb);
  const range = ceiling === undefined ? 'de al menos 1 MB' : `entre 1 y ${ceiling} MB`;
  const error = `El límite debe ser un número entero ${range}.`;

  if (!trimmed) return required ? { value: null, error } : { value: null, error: null };
  if (!/^\d+$/.test(trimmed)) return { value: null, error };

  const value = Number(trimmed);
  if (value < 1 || (ceiling !== undefined && value > ceiling)) return { value: null, error };
  return { value, error: null };
}
