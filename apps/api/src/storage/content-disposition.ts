/**
 * Cabecera `Content-Disposition` que aguanta cualquier nombre de archivo.
 *
 * Una cabecera HTTP sólo admite caracteres de un byte. Con una raya de Word (–), unas
 * comillas tipográficas o un emoji en el nombre, Node rechaza la cabecera y la descarga
 * termina en un 500.
 *
 * Se manda un nombre de reserva en ASCII y, al lado, el nombre real codificado como pide
 * el RFC 6266. Los navegadores actuales usan el segundo; el primero sólo lo ven los muy
 * antiguos.
 */
export function contentDisposition(mode: 'inline' | 'attachment', name: string): string {
  // Fuera saltos, comillas y barras invertidas: con ellos se podrían inyectar cabeceras.
  const cleaned =
    name
      .replace(/[\r\n"\\]/g, '')
      .trim()
      .slice(0, 200) || 'archivo';

  const fallbackName = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // «Evaluación» → «Evaluacion»
    .replace(/[^\x20-\x7e]/gu, '_'); // con `u`, un emoji cuenta como un carácter y no como dos

  // `encodeURIComponent` deja pasar ' ( ) * y el RFC 5987 no los admite sin codificar.
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${mode}; filename="${fallbackName}"; filename*=UTF-8''${encoded}`;
}
