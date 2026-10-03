import { StorageService } from '../storage/storage.service';
import { quizConfigForEditor } from './quiz-config';

/** Recurso tal y como sale de la base de datos, en lo que aquí importa. */
interface StoredResource {
  attachmentKey: string | null;
  fileUrl: string | null;
  quizConfig: string | null;
  [key: string]: unknown;
}

/**
 * Proyección de un recurso hacia el navegador.
 *
 * El material de curso sólo se sirve con una URL firmada y caducable, que construye el
 * servidor. Se conservan también las claves originales, que el editor reenvía al guardar.
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
    attachmentUrl: resource.attachmentKey ? storage.downloadUrl(resource.attachmentKey) : null,
    fileDownloadUrl: resource.fileUrl ? storage.downloadUrl(resource.fileUrl) : null,
  };
}
