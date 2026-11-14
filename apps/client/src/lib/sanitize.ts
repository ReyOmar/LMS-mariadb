import DOMPurify, { type DOMPurify as Purifier, type UponSanitizeAttributeHookEvent } from 'dompurify';
import { safeClasses, safeStyle } from './content-style';

/**
 * Limpieza del HTML que escriben examinadores y administradores: el contenido de los
 * cursos y las plantillas de correo.
 *
 * Todo lo que se pinta con `dangerouslySetInnerHTML` pasa por aquí. La lista es corta a
 * propósito: se permite lo que producen los editores y nada más. Quedan fuera los
 * formularios, los `script`, los `iframe`, las etiquetas `style` y cualquier atributo de
 * evento, que son las formas habituales de colar código ajeno en la sesión de otro usuario.
 * De `style` y `class` sólo pasa lo que da formato (`content-style.ts`).
 */
// La lista se lee mejor agrupada por familias que con una etiqueta por línea.
// prettier-ignore
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    // Bloques
    'p', 'div', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    // Formato en línea
    'b', 'i', 'u', 's', 'em', 'strong', 'sub', 'sup', 'mark', 'small', 'span',
    // Listas
    'ul', 'ol', 'li',
    // Enlaces
    'a',
    // Medios (sólo imágenes)
    'img',
    // Tablas
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'title', 'alt',
    'src', 'width', 'height',
    'class', 'style',
    'colspan', 'rowspan', 'scope',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
};

/**
 * Devuelve el HTML ya limpio, en la forma que espera `dangerouslySetInnerHTML`.
 *
 * Acepta nulos porque el contenido de un recurso puede no existir todavía; así ninguna
 * pantalla necesita escribir `|| ''` antes de llamar.
 *
 * @param options.linksInNewTab Por defecto los enlaces salen a una pestaña nueva y sin dar
 *        acceso a la ventana original. El editor de plantillas lo desactiva: lo que pinta se
 *        vuelve a guardar, y no debe añadir atributos que el administrador no escribió.
 *
 * @example
 * <div dangerouslySetInnerHTML={sanitizeHTML(resource.contentHtml)} />
 */
export function sanitizeHTML(
  dirty: string | null | undefined,
  { linksInNewTab = true }: { linksInNewTab?: boolean } = {},
): { __html: string } {
  const input = dirty ?? '';

  if (typeof window === 'undefined') {
    // En el servidor no hay DOM: se entrega el texto sin ninguna etiqueta.
    return { __html: input.replace(/<[^>]*>/g, '') };
  }

  return { __html: purifierFor(linksInNewTab).sanitize(input, SANITIZE_CONFIG) };
}

const RESTRICTED_ATTRIBUTES: Record<string, (value: string) => string> = { style: safeStyle, class: safeClasses };

/** Deja de `style` y `class` sólo lo admitido; si no queda nada, el atributo no se conserva. */
function restrictPresentation(_node: Element, attribute: UponSanitizeAttributeHookEvent): void {
  const restrict = RESTRICTED_ATTRIBUTES[attribute.attrName];
  if (!restrict) return;

  attribute.attrValue = restrict(attribute.attrValue);
  attribute.keepAttr = attribute.attrValue !== '';
}

function openInNewTab(node: Element): void {
  if (node.tagName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
}

const purifiers = new Map<boolean, Purifier>();

/** Un limpiador por modo, con sus reglas ya puestas: no se añaden ni se quitan en cada llamada. */
function purifierFor(linksInNewTab: boolean): Purifier {
  let purifier = purifiers.get(linksInNewTab);
  if (!purifier) {
    purifier = DOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', restrictPresentation);
    if (linksInNewTab) purifier.addHook('afterSanitizeAttributes', openInNewTab);
    purifiers.set(linksInNewTab, purifier);
  }
  return purifier;
}
