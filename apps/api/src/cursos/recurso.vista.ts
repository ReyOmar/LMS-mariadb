import { StorageService } from '../storage/storage.service';

/** Recurso tal y como sale de la base de datos, en lo que aquí importa. */
interface RecursoAlmacenado {
  archivo_adjunto: string | null;
  url_archivo: string | null;
  [clave: string]: unknown;
}

/**
 * Proyección de un recurso hacia el navegador.
 *
 * El material de curso vive en una carpeta reservada del almacenamiento, así que sólo se
 * sirve con una URL firmada y caducable. Construirla es responsabilidad del servidor: si
 * el cliente intentara componer la ruta a partir de la clave, la descarga sería rechazada.
 *
 * Se conservan también las claves originales, que el editor de cursos necesita para
 * reenviarlas al guardar sin tener que deducirlas de la URL.
 */
export function recursoParaElCliente<T extends RecursoAlmacenado>(recurso: T, storage: StorageService) {
  return {
    ...recurso,
    archivo_adjunto_url: recurso.archivo_adjunto ? storage.urlDeDescarga(recurso.archivo_adjunto) : null,
    url_archivo_url: recurso.url_archivo ? storage.urlDeDescarga(recurso.url_archivo) : null,
  };
}
