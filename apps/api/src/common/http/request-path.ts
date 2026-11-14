/**
 * La ruta de una petición sin su consulta, que es lo que se escribe en el registro: en la consulta
 * viajan la firma de los enlaces de descarga y lo que cada persona busca.
 */
export function pathOf(url: string | undefined): string {
  return (url ?? '').split('?', 1)[0];
}
