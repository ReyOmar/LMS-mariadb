import { Folder } from './folders';

/** Un MB, en bytes. Los límites se configuran en MB y se aplican en bytes. */
export const MIB = 1024 * 1024;

/** Tope técnico cuando `MAX_UPLOAD_MB` no está definido: 2 GB. */
export const DEFAULT_UPLOAD_CEILING_MB = 2048;

/**
 * Máximo que admite `MAX_UPLOAD_MB`.
 *
 * Cloudflare R2 no acepta más de 5 GiB en una sola petición de subida, y el almacenamiento
 * sube cada archivo de una vez. Por encima haría falta la subida por partes, que en un
 * alojamiento cPanel no tiene sentido.
 */
export const MAX_UPLOAD_CEILING_MB = 5000;

/**
 * Topes fijos de las carpetas de imágenes. Son logotipos, fondos, portadas, fotos y firmas,
 * no entregables: con unos pocos MB sobra, y todo lo que pesen de más lo descarga cada
 * visitante. El cliente repite estos valores en `apps/client/src/lib/upload-limits.ts`.
 */
export const IMAGE_LIMITS_MB: Readonly<Partial<Record<Folder, number>>> = {
  logos: 5,
  portadas: 5,
  fondos: 10,
  avatars: 5,
  firmas: 2,
};

/** Tope aplicable a una subida y el mensaje con el que se rechaza lo que lo supere. */
export interface UploadLimit {
  readonly bytes: number;
  readonly mb: number;
  readonly message: string;
}

/**
 * Interpreta `MAX_UPLOAD_MB`. Un valor que no sea un entero positivo se ignora con aviso:
 * mejor arrancar con el tope por defecto que con uno inventado.
 */
export function readUploadCeiling(raw: string | undefined): { mb: number; warning: string | null } {
  const text = raw?.trim();
  if (!text) return { mb: DEFAULT_UPLOAD_CEILING_MB, warning: null };

  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    return {
      mb: DEFAULT_UPLOAD_CEILING_MB,
      warning: `MAX_UPLOAD_MB="${text}" no es un número entero de MB; se usa ${DEFAULT_UPLOAD_CEILING_MB}.`,
    };
  }
  if (value > MAX_UPLOAD_CEILING_MB) {
    return {
      mb: MAX_UPLOAD_CEILING_MB,
      warning: `MAX_UPLOAD_MB=${value} supera el máximo admitido; se usa ${MAX_UPLOAD_CEILING_MB}.`,
    };
  }
  return { mb: value, warning: null };
}

/**
 * Tope técnico de cualquier subida, en MB.
 *
 * Se lee en cada llamada y no al cargar el módulo: en desarrollo el `.env` lo carga
 * `ConfigModule`, que se inicia después de importarse este archivo.
 */
export function uploadCeilingMb(): number {
  return readUploadCeiling(process.env.MAX_UPLOAD_MB).mb;
}

/** `1024` → «1 GB»; `10` → «10 MB». */
export function formatMb(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** Mensaje de rechazo, que dice cuál es el límite y de dónde sale. */
function tooLargeMessage(folder: Folder | undefined, mb: number): string {
  const limit = formatMb(mb);
  if (folder && IMAGE_LIMITS_MB[folder] !== undefined) return `La imagen supera el límite de ${limit}.`;
  if (folder === 'entregas') return `El archivo supera el límite de ${limit} de esta tarea.`;
  if (folder === 'recursos') return `El archivo supera el límite de ${limit} configurado para la sede.`;
  return `El archivo supera el límite de ${limit} que admite la plataforma.`;
}

/**
 * Límite exacto de una subida.
 *
 *  - Imágenes: su tope fijo, aunque se pida uno mayor.
 *  - Entregas: el de la tarea o, si no tiene, el general de la sede (lo decide quien llama).
 *  - Material de curso: el general de la sede.
 *
 * Nada supera el tope técnico: un límite guardado antes de bajar `MAX_UPLOAD_MB` se recorta
 * a él, y el mensaje nombra el que de verdad se aplica.
 *
 * @param configuredMb Límite configurado para la operación, en MB. Sin él rige el tope técnico.
 */
export function uploadLimit(
  folder?: Folder,
  configuredMb?: number | null,
  ceilingMb: number = uploadCeilingMb(),
): UploadLimit {
  const candidates = [ceilingMb, folder ? IMAGE_LIMITS_MB[folder] : undefined, configuredMb].filter(
    (value): value is number => typeof value === 'number' && value > 0,
  );
  const mb = Math.min(...candidates);
  return { mb, bytes: Math.floor(mb * MIB), message: tooLargeMessage(folder, mb) };
}
