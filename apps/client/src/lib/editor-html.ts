/**
 * HTML del editor de texto de los cursos, listo para guardarse.
 *
 * Quill 2 exporta cada espacio como `&nbsp;` (`getSemanticHTML`), y un espacio rígido no es
 * un punto por el que se pueda partir la línea: un párrafo entero quedaba en una sola línea
 * que se salía de la pantalla del alumno. El contenido que ya tenía esos espacios vuelve al
 * editor como el carácter U+00A0, así que se tratan las dos formas.
 *
 * Sólo se toca el texto, no las etiquetas. Un espacio suelto vuelve a ser normal; en una
 * racha de varios, el primero pasa a normal —ahí se puede partir la línea— y el resto sigue
 * rígido para conservar la separación que se escribió.
 */
export function breakableSpaces(html: string): string {
  return html.replace(/<[^>]*>|[^<]+/g, (chunk) =>
    chunk.startsWith('<') ? chunk : chunk.replace(NON_BREAKING_RUN, (run) => ` ${'&nbsp;'.repeat(spacesIn(run) - 1)}`),
  );
}

/**
 * Si el HTML del editor tiene algo que enseñar: texto o una imagen. El editor vacío no deja
 * una cadena vacía sino párrafos vacíos (`<p></p>`, `<p><br></p>`), que no deben ocupar el
 * sitio del aviso «sin contenido».
 */
export function hasContent(html: string | null | undefined): html is string {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(NON_BREAKING_RUN, '')
      .trim() !== ''
  );
}

/** Racha de espacios rígidos, escritos como entidad o como el propio carácter. */
const NON_BREAKING_RUN = /(?:&nbsp;|\u00a0)+/g;

function spacesIn(run: string): number {
  return run.replaceAll('&nbsp;', '\u00a0').length;
}
