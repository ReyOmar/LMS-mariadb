import { variableData } from './variables';

/** Marca con la que se reconoce una etiqueta de variable dentro del editor. */
const ATTRIBUTE = 'data-variable';

const TAGS_OR_TEXT = /<[^>]*>|[^<]+/g;
const VARIABLE = /\{\{(\w+)\}\}/g;

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
 * Convierte cada `{{variable}}` del texto en una etiqueta que se inserta y se borra de una pieza.
 * Las que van dentro de un atributo (`href="{{url_campus}}"`) se dejan: un `<span>` ahí rompería el enlace.
 */
export function toEditable(html: string): string {
  return html.replace(TAGS_OR_TEXT, (chunk) =>
    chunk.startsWith('<') ? chunk : chunk.replace(VARIABLE, (_, variable: string) => variableLabelHtml(variable)),
  );
}

/**
 * El navegador reordena los atributos al editar, así que la etiqueta se reconoce sólo por su marca.
 * Dentro nunca hay otra etiqueta: `[^<]*` no se desboca.
 */
const LABEL_PATTERN = new RegExp(`<span\\b[^>]*\\b${ATTRIBUTE}="([^"]+)"[^>]*>[^<]*</span>`, 'gi');

/** Devuelve lo editado a la forma que se guarda: las etiquetas vuelven a ser `{{variable}}`. */
export function toTemplate(editedHtml: string): string {
  return editedHtml.replace(LABEL_PATTERN, (_, variable: string) => `{{${variable}}}`);
}

/** El asunto viaja como texto plano: sin el marcado que añade el navegador ni espacios rígidos. */
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
