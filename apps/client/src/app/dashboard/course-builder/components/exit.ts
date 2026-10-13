import { BUILDER_PATH } from './paths';

/**
 * Si un enlace deja abierto el mismo curso —su temario, el editor de un recurso suyo o una descarga—
 * y no hay que avisar de que sigue en borrador. El constructor sin curso o con otro lo cierran.
 */
export function staysInCourse(destination: string, courseGuid: string): boolean {
  // El origen sólo hace falta para poder leer ruta y consulta con `URL`.
  const { pathname, searchParams } = new URL(`http://campus.invalid${destination}`);
  const path = pathname.replace(/\/$/, '');

  if (path.includes('/storage/download/')) return true;
  if (path === BUILDER_PATH) return searchParams.get('course') === courseGuid;
  return path.startsWith(`${BUILDER_PATH}/${courseGuid}/`);
}
