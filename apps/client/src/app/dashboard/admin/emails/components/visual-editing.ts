import { variableData } from './preview';

/** Marca con la que se reconoce una etiqueta de variable dentro del editor. */
const ATTRIBUTE = 'data-variable';

/** La etiqueta de una variable, lista para insertarse donde esté el cursor. */
export function variableLabelHtml(variable: string): string {
  const { label } = variableData(variable);
  return (
    `<span ${ATTRIBUTE}="${variable}" contenteditable="false" ` +
    `style="display:inline-block;padding:1px 8px;margin:0 1px;border-radius:99px;` +
    `font-size:12px;font-weight:700;background:#e0e7ff;color:#3730a3;` +
    `border:1px solid #c7d2fe;white-space:nowrap">${label}</span>`
  );
}

/**
 * Prepara la plantilla para editarla viéndola.
 *
 * Cada `{{variable}}` del texto se convierte en una etiqueta que no se puede escribir por
 * dentro, de modo que se inserta y se borra como una sola pieza. Se enseña el nombre de la
 * variable y no su valor de ejemplo a propósito: editando sobre el ejemplo, al guardar
 * quedaría «Juan» grabado en la plantilla en lugar de `{{nombre}}`.
 *
 * Las variables que están **dentro de una etiqueta HTML** —`href="{{url_campus}}"`— se
 * dejan tal cual: meter ahí un `<span>` con comillas cierra el atributo antes de tiempo y
 * descuadra el enlace. Además no son texto visible, así que no hay nada que enseñar.
 */
export function toEditable(html: string): string {
  // Se recorre alternando etiquetas y texto; sólo el texto se toca.
  return html.replace(/<[^>]*>|[^<]+/g, (chunk) =>
    chunk.startsWith('<')
      ? chunk
      : chunk.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => variableLabelHtml(variable)),
  );
}

/**
 * Una etiqueta de variable, venga con los atributos en el orden que venga.
 *
 * El navegador los reordena y reescribe mientras se escribe encima, así que lo único
 * estable es la marca. Dentro nunca hay otra etiqueta —sólo el nombre legible—, de modo
 * que `[^<]*` basta y no se desboca.
 */
const LABEL_PATTERN = new RegExp(`<span\\b[^>]*\\b${ATTRIBUTE}="([^"]+)"[^>]*>[^<]*</span>`, 'gi');

/** Devuelve lo editado a la forma que se guarda: las etiquetas vuelven a ser `{{variable}}`. */
export function toTemplate(editedHtml: string): string {
  return editedHtml.replace(LABEL_PATTERN, (_, variable: string) => `{{${variable}}}`);
}

/**
 * El asunto que se guarda, a partir de lo editado.
 *
 * El asunto viaja como texto plano, así que además de devolver las etiquetas a su forma
 * `{{variable}}` hay que quitar el marcado que el navegador añade al escribir y devolver
 * los espacios rígidos a espacios normales.
 */
export function subjectText(editedHtml: string): string {
  return toTemplate(editedHtml)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
