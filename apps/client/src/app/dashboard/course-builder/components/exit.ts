const BUILDER = '/dashboard/course-builder';

/**
 * Si pulsar un enlace del campus deja abierto el mismo curso del constructor, y no hace falta
 * avisar de que sigue en borrador: otra parte de su temario (`?course=<curso>&resource=…`), el
 * editor de uno de sus recursos (`/dashboard/course-builder/<curso>/modules/…`) o la descarga
 * de un archivo, que baja sin mover la pantalla.
 *
 * El constructor a secas —el enlace «Gestión de cursos» del menú— vuelve al catálogo, y con otro
 * curso abre ése: los dos cierran el que se está editando, así que cuentan como salir.
 */
export function staysInCourse(destination: string, courseGuid: string): boolean {
  // El destino es ruta, consulta y fragmento; el origen se pone sólo para poder leerlo.
  const { pathname, searchParams } = new URL(`http://campus.invalid${destination}`);
  const path = pathname.replace(/\/$/, '');

  if (path.includes('/storage/download/')) return true;
  if (path === BUILDER) return searchParams.get('course') === courseGuid;
  return path.startsWith(`${BUILDER}/${courseGuid}/`);
}
