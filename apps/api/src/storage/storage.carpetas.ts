/**
 * Clasificación de los archivos del LMS por sensibilidad.
 *
 * Antes toda la ruta de descarga era pública y el modelo de seguridad declarado era «los
 * nombres son aleatorios». Bajo esa misma ruta se servían entregas de alumnos, firmas de
 * examinadores y certificados: una URL filtrada en un historial, un proxy o una captura
 * dejaba el documento accesible para siempre.
 *
 * Ahora hay dos clases de archivo:
 *  - PÚBLICOS: material de marca que la portada necesita antes de iniciar sesión.
 *  - RESERVADOS: todo lo demás, que sólo se sirve con una URL firmada y caducable.
 */

/** Archivos que cualquiera puede pedir: son parte de la identidad visual del sitio. */
export const CARPETAS_PUBLICAS = ['logos', 'portadas', 'fondos', 'avatars'] as const;

/** Archivos que exigen una URL firmada por la API. */
export const CARPETAS_RESERVADAS = ['entregas', 'certificados', 'firmas', 'recursos'] as const;

export const CARPETAS = [...CARPETAS_PUBLICAS, ...CARPETAS_RESERVADAS] as const;

export type Carpeta = (typeof CARPETAS)[number];

export function esCarpeta(valor: unknown): valor is Carpeta {
  return typeof valor === 'string' && (CARPETAS as readonly string[]).includes(valor);
}

/** Indica si la clave apunta a un archivo que puede servirse sin firma. */
export function esClavePublica(clave: string): boolean {
  const carpeta = clave.split('/')[0];
  return (CARPETAS_PUBLICAS as readonly string[]).includes(carpeta);
}
