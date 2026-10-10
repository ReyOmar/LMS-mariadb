/**
 * Aplicación del tema de la sede al documento.
 *
 * La marca (color, tipografía, redondeo) es configurable por sede desde el panel
 * de administración, así que se aplica en tiempo de ejecución sobre variables CSS. El
 * contexto de configuración trae los datos; esto sólo los pinta. `public/theme-preload.js`
 * repite la parte de colores y redondeo para aplicarla antes de que React monte.
 */

export interface CountryTheme {
  primaryColor?: string;
  secondaryColor?: string;
  font?: string;
  borderRadius?: number;
}

/** Tipografías admitidas en el selector del panel. */
export const FONTS = ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Outfit', 'Open Sans', 'Lato'] as const;
export type Font = (typeof FONTS)[number];

/** Variable CSS con la que `lib/fonts.ts` publica cada tipografía autoalojada. */
const FONT_VARIABLES: Record<Font, string> = {
  Inter: '--font-inter',
  Roboto: '--font-roboto',
  Montserrat: '--font-montserrat',
  Poppins: '--font-poppins',
  Outfit: '--font-outfit',
  'Open Sans': '--font-open-sans',
  Lato: '--font-lato',
};

function isFont(value: string): value is Font {
  return (FONTS as readonly string[]).includes(value);
}

/** `font-family` de una tipografía del selector, con alternativas del sistema. */
export function fontFamilyOf(font: string): string {
  const variable = isFont(font) ? `var(${FONT_VARIABLES[font]}), ` : '';
  return `${variable}ui-sans-serif, system-ui, sans-serif`;
}

const STYLE_ELEMENT_ID = 'lms-theme';

// ── Color y contraste ───────────────────────────────────────────────────────

/** Color con los valores redondeados que se escriben en las variables CSS: grados y porcentajes. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Contraste mínimo de WCAG AA para texto de tamaño normal. */
export const MIN_CONTRAST = 4.5;

const WHITE: Hsl = { h: 0, s: 0, l: 100 };
/** Texto oscuro sobre colores claros: el `--primary-foreground` del modo oscuro en `globals.css`. */
const DARK_TEXT: Hsl = { h: 220, s: 30, l: 8 };
/**
 * Superficie más clara de cada modo, la más exigente para el primario usado como texto:
 * las tarjetas en modo claro y `--muted` en modo oscuro, que además cubre los fondos teñidos
 * con el propio primario (`bg-primary/10`).
 */
const LIGHT_SURFACE: Hsl = WHITE;
const DARK_SURFACE: Hsl = { h: 220, s: 18, l: 14 };
/** En modo oscuro el primario nunca baja de esta luminosidad, para que destaque sobre el fondo. */
const DARK_MIN_LIGHTNESS = 62;

/** Convierte `#RGB` o `#RRGGBB` a HSL redondeado. */
export function hexToHsl(hex: string): Hsl | null {
  const cleaned = hex.replace(/^#/, '');
  const fullHex = cleaned.length === 3 ? [...cleaned].map((c) => c + c).join('') : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) return null;

  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Triplete `H S% L%` que esperan las variables de Tailwind. */
function hslCss({ h, s, l }: Hsl): string {
  return `${h} ${s}% ${l}%`;
}

/** Canales RGB entre 0 y 1 (fórmula de CSS Color 4). */
function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

/** Luminancia relativa de WCAG. */
function luminance(color: Hsl): number {
  const [r, g, b] = hslToRgb(color).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste de WCAG entre dos colores, de 1 a 21. */
export function contrastRatio(a: Hsl, b: Hsl): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Texto que mejor se lee sobre un fondo: blanco u oscuro, el que más contraste dé. */
export function readableForeground(background: Hsl): Hsl {
  return contrastRatio(background, WHITE) >= contrastRatio(background, DARK_TEXT) ? WHITE : DARK_TEXT;
}

/**
 * El primario para el modo oscuro: el mismo tono, aclarado lo necesario para que se lea
 * como texto sobre el fondo oscuro y su texto encima también se lea.
 */
export function darkModeVariant(color: Hsl): Hsl {
  for (let l = Math.max(color.l, DARK_MIN_LIGHTNESS); l < 100; l++) {
    const candidate = { ...color, l };
    if (
      contrastRatio(candidate, DARK_SURFACE) >= MIN_CONTRAST &&
      contrastRatio(candidate, readableForeground(candidate)) >= MIN_CONTRAST
    ) {
      return candidate;
    }
  }
  return { ...color, l: 100 };
}

interface ModeColors {
  primary: Hsl;
  foreground: Hsl;
}

/** Primario y texto sobre el primario en cada modo. En modo claro el color es el de la marca, sin tocar. */
export function primaryPalette(hex: string): { light: ModeColors; dark: ModeColors } | null {
  const brand = hexToHsl(hex);
  if (!brand) return null;
  const dark = darkModeVariant(brand);
  return {
    light: { primary: brand, foreground: readableForeground(brand) },
    dark: { primary: dark, foreground: readableForeground(dark) },
  };
}

export interface ModeContrast {
  /** Texto sobre el primario: botones, etiquetas, el día de hoy en el calendario. */
  button: number;
  /** El primario como texto sobre el fondo: títulos, enlaces, el menú activo. */
  text: number;
}

/** Contraste que consigue un color primario en cada modo, para avisar al elegirlo. */
export function primaryContrast(hex: string): { light: ModeContrast; dark: ModeContrast } | null {
  const palette = primaryPalette(hex);
  if (!palette) return null;
  const measure = ({ primary, foreground }: ModeColors, surface: Hsl): ModeContrast => ({
    button: contrastRatio(primary, foreground),
    text: contrastRatio(primary, surface),
  });
  return { light: measure(palette.light, LIGHT_SURFACE), dark: measure(palette.dark, DARK_SURFACE) };
}

// ── Aplicación ──────────────────────────────────────────────────────────────

function declarations(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}

/**
 * Hoja de estilos con las variables del tema.
 *
 * Va en un bloque `<style>` y no en el atributo `style` de `<html>` por dos motivos: el
 * atributo ganaría también a la regla `.dark` y el primario de la marca se quedaría sin
 * ajustar en modo oscuro; y Tailwind v4 resuelve `--radius` en tiempo de compilación, así
 * que hace falta una regla que lo sobrescriba. Las variables de `globals.css` están en
 * `@layer base` y cualquier regla fuera de capa les gana; entre estas dos, `.dark` va
 * después de `:root` para imponerse en modo oscuro.
 */
export function themeCss(theme: CountryTheme): string {
  const brandVariables = ({ primary, foreground }: ModeColors): Record<string, string> => ({
    '--primary': hslCss(primary),
    '--primary-foreground': hslCss(foreground),
    '--ring': hslCss(primary),
  });

  const palette = theme.primaryColor ? primaryPalette(theme.primaryColor) : null;
  const root: Record<string, string> = palette ? brandVariables(palette.light) : {};

  // El secundario sólo decora (degradados y halos, nunca lleva texto encima): vale igual en los dos modos.
  const secondary = theme.secondaryColor ? hexToHsl(theme.secondaryColor) : null;
  if (secondary) root['--secondary'] = hslCss(secondary);

  const radius = theme.borderRadius ?? 12;
  const scaled = (delta: number) => `${Math.max(0, radius + delta)}px`;
  Object.assign(root, {
    '--radius': scaled(0),
    '--radius-sm': scaled(-4),
    '--radius-md': scaled(-2),
    '--radius-lg': scaled(0),
    '--radius-xl': scaled(4),
    '--radius-2xl': scaled(8),
    '--radius-3xl': scaled(12),
    '--radius-4xl': scaled(16),
  });

  const family = theme.font ? fontFamilyOf(theme.font) : null;
  if (family) root['--font-sans'] = family;

  return (
    `:root{${declarations(root)}}` +
    (palette ? `.dark{${declarations(brandVariables(palette.dark))}}` : '') +
    (family ? `body{font-family:${family};}` : '')
  );
}

/** Escribe las variables del tema en el bloque de estilos que comparte con `theme-preload.js`. */
export function applyTheme(theme: CountryTheme): void {
  if (typeof document === 'undefined') return;

  let styles = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styles) {
    styles = document.createElement('style');
    styles.id = STYLE_ELEMENT_ID;
    document.head.appendChild(styles);
  }
  styles.textContent = themeCss(theme);
}
