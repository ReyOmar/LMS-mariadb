import { uploadFile } from './api';
import { imageFormatWarning } from './image-formats';
import { fileSizeWarning, uploadLimit, type ImageFolder } from './upload-limits';

/** Por qué no se puede usar la imagen elegida en esa carpeta, o `null` si vale. */
export function imageUploadWarning(file: File, folder: ImageFolder): string | null {
  return imageFormatWarning(file, folder) ?? fileSizeWarning(file, uploadLimit(folder));
}

/** Sube la imagen a su carpeta y devuelve la clave con la que se guarda. */
export async function uploadImage(file: File, folder: ImageFolder): Promise<string> {
  const { filename } = await uploadFile(`/storage/upload?folder=${folder}`, file, { limit: uploadLimit(folder) });
  return filename;
}
