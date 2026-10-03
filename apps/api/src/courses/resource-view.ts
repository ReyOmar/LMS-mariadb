import { StorageService } from '../storage/storage.service';
import { isStorageKey } from '../storage/folders';
import { quizConfigForEditor } from './quiz-config';

/** Recurso tal y como sale de la base de datos, en lo que aquí importa. */
interface StoredResource {
  attachmentKey: string | null;
  attachmentName?: string | null;
  fileUrl: string | null;
  quizConfig: string | null;
  [key: string]: unknown;
}

/**
 * Proyección de un recurso hacia el navegador.
 *
 * El material de curso sólo se sirve con una URL firmada y caducable, que construye el
 * servidor, y sólo se firman claves de la carpeta de recursos: un recurso no sirve para
 * obtener el enlace de una entrega, una firma o un certificado. Se conservan también las
 * claves originales, que el editor reenvía al guardar.
 * El cuestionario sale por defecto con las respuestas, para el editor; la vista del alumno
 * pasa su propia proyección, sin ellas.
 */
export function toClientResource<T extends StoredResource>(
  resource: T,
  storage: StorageService,
  projectQuiz: (stored: string | null) => string | null = quizConfigForEditor,
) {
  return {
    ...resource,
    quizConfig: projectQuiz(resource.quizConfig),
    attachmentUrl: isResourceFile(resource.attachmentKey)
      ? storage.downloadUrl(resource.attachmentKey, resource.attachmentName)
      : null,
    fileDownloadUrl: isResourceFile(resource.fileUrl) ? storage.downloadUrl(resource.fileUrl) : null,
  };
}

function isResourceFile(key: string | null): key is string {
  return isStorageKey(key, ['recursos']);
}
