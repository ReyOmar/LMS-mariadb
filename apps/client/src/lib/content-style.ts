/**
 * Qué presentación puede traer el HTML que escriben examinadores y administradores.
 *
 * Se admite lo que da formato dentro de su propia caja —color, tipografía, espaciado, bordes— y
 * nada que saque un elemento de ella: con `position`, `z-index` o un margen negativo, un recurso
 * de un curso podría tapar la pantalla entera con un enlace falso («Tu sesión caducó, pulsa aquí»).
 */

const BOX_SIDES = ['', '-top', '-right', '-bottom', '-left'];

const ALLOWED_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background',
  'background-color',
  'opacity',
  'box-shadow',
  // Tipografía
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-transform',
  'vertical-align',
  'white-space',
  'word-break',
  'overflow-wrap',
  // Caja
  ...BOX_SIDES.flatMap((side) => [`margin${side}`, `padding${side}`, `border${side}`]),
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'display',
  'overflow',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  // Listas
  'list-style',
  'list-style-type',
]);

/** Las únicas clases que escribe el editor de contenido (alineación, sangría, tamaño…). */
const EDITOR_CLASS = /^ql-[\w-]+$/;

/** Un margen negativo arrastra el elemento fuera de su sitio, encima de lo que tenga al lado. */
function pullsOutOfPlace(property: string, value: string): boolean {
  return property.startsWith('margin') && /(^|[\s(])-/.test(value);
}

function isAllowed(declaration: string): boolean {
  const separator = declaration.indexOf(':');
  if (separator < 1) return false;

  const property = declaration.slice(0, separator).trim().toLowerCase();
  const value = declaration.slice(separator + 1).trim();
  return ALLOWED_PROPERTIES.has(property) && !pullsOutOfPlace(property, value);
}

/**
 * El atributo `style` sin las declaraciones que no se admiten. Si todas valen se devuelve tal
 * cual, letra por letra: el editor de plantillas vuelve a guardar lo que pinta.
 */
export function safeStyle(style: string): string {
  const declarations = style.split(';').filter((declaration) => declaration.trim());
  const allowed = declarations.filter(isAllowed);
  return allowed.length === declarations.length ? style : allowed.map((declaration) => declaration.trim()).join('; ');
}

/** El atributo `class` sólo con las clases del editor: las de la aplicación no son del contenido. */
export function safeClasses(classes: string): string {
  const names = classes.split(/\s+/).filter(Boolean);
  const allowed = names.filter((name) => EDITOR_CLASS.test(name));
  return allowed.length === names.length ? classes : allowed.join(' ');
}
