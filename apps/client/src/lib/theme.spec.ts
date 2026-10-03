import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import {
  MIN_CONTRAST,
  contrastRatio,
  darkModeVariant,
  hexToHsl,
  primaryContrast,
  primaryPalette,
  readableForeground,
  themeCss,
  type CountryTheme,
  type Hsl,
} from './theme';

const WHITE: Hsl = { h: 0, s: 0, l: 100 };
const BLACK: Hsl = { h: 0, s: 0, l: 0 };
const DARK_TEXT: Hsl = { h: 220, s: 30, l: 8 };

/** Marcas de las dos sedes. */
const MEXICO = '#1f2937';
const COLOMBIA = '#0F766E';

/** Muestra de colores de toda la rueda y todas las luminosidades: 216 en total. */
const SAMPLE = (() => {
  const steps = ['00', '33', '66', '99', 'cc', 'ff'];
  return steps.flatMap((r) => steps.flatMap((g) => steps.map((b) => `#${r}${g}${b}`)));
})();

describe('contraste', () => {
  it('va de 1, entre un color y él mismo, a 21, entre blanco y negro', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(DARK_TEXT, DARK_TEXT)).toBe(1);
  });

  it('coincide con los valores de referencia de WCAG', () => {
    expect(contrastRatio({ h: 0, s: 100, l: 50 }, WHITE)).toBeCloseTo(4, 1);
    expect(contrastRatio({ h: 120, s: 100, l: 50 }, BLACK)).toBeCloseTo(15.3, 1);
    expect(contrastRatio({ h: 240, s: 100, l: 50 }, WHITE)).toBeCloseTo(8.59, 2);
  });

  it('convierte los hexadecimales a HSL redondeado y rechaza lo que no lo es', () => {
    expect(hexToHsl(MEXICO)).toEqual({ h: 215, s: 28, l: 17 });
    expect(hexToHsl(COLOMBIA)).toEqual({ h: 175, s: 77, l: 26 });
    expect(hexToHsl('#fff')).toEqual(WHITE);
    expect(hexToHsl('azul')).toBeNull();
    expect(hexToHsl('#12345')).toBeNull();
  });
});

describe('texto sobre un color', () => {
  it('es blanco sobre las marcas oscuras de las sedes', () => {
    expect(readableForeground(hexToHsl(MEXICO)!)).toEqual(WHITE);
    expect(readableForeground(hexToHsl(COLOMBIA)!)).toEqual(WHITE);
  });

  it('es oscuro sobre colores claros', () => {
    expect(readableForeground(hexToHsl('#facc15')!)).toEqual(DARK_TEXT);
    expect(readableForeground(WHITE)).toEqual(DARK_TEXT);
  });

  it('es siempre el que más contraste da', () => {
    for (const hex of SAMPLE) {
      const color = hexToHsl(hex)!;
      const chosen = contrastRatio(color, readableForeground(color));
      expect(chosen).toBeGreaterThanOrEqual(contrastRatio(color, WHITE));
      expect(chosen).toBeGreaterThanOrEqual(contrastRatio(color, DARK_TEXT));
    }
  });
});

describe('primario en modo oscuro', () => {
  it('conserva el tono y la saturación y sólo aclara', () => {
    const brand = hexToHsl(MEXICO)!;
    const dark = darkModeVariant(brand);
    expect(dark.h).toBe(brand.h);
    expect(dark.s).toBe(brand.s);
    expect(dark.l).toBeGreaterThanOrEqual(62);
  });

  it('no oscurece un color que ya es claro', () => {
    expect(darkModeVariant({ h: 50, s: 90, l: 80 })).toEqual({ h: 50, s: 90, l: 80 });
  });

  it('aclara más allá del mínimo cuando el tono lo pide', () => {
    // El azul puro apenas tiene luminancia: al 62 % todavía no se lee sobre el fondo oscuro.
    expect(darkModeVariant({ h: 240, s: 100, l: 50 }).l).toBeGreaterThan(62);
  });

  it('se lee como texto y con su texto encima para cualquier marca', () => {
    for (const hex of SAMPLE) {
      const { dark } = primaryContrast(hex)!;
      expect(dark.button).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(dark.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('marcas de las sedes', () => {
  it.each([
    ['México', MEXICO],
    ['Colombia', COLOMBIA],
  ])('%s cumple 4,5:1 en los dos modos', (_name, hex) => {
    const contrast = primaryContrast(hex)!;
    for (const mode of [contrast.light, contrast.dark]) {
      expect(mode.button).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(mode.text).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('México lleva texto blanco en modo claro y oscuro en modo oscuro', () => {
    const palette = primaryPalette(MEXICO)!;
    expect(palette.light).toEqual({ primary: { h: 215, s: 28, l: 17 }, foreground: WHITE });
    expect(palette.dark.foreground).toEqual(DARK_TEXT);
  });

  it('un color claro no se lee como texto en modo claro y hay que avisar', () => {
    expect(primaryContrast('#fde047')!.light.text).toBeLessThan(MIN_CONTRAST);
  });

  it('un color que no es hexadecimal no produce paleta', () => {
    expect(primaryPalette('rojo')).toBeNull();
    expect(primaryContrast('rojo')).toBeNull();
  });
});

describe('hoja de estilos del tema', () => {
  it('define el primario de cada modo, con la regla oscura después de la clara', () => {
    const css = themeCss({ primaryColor: MEXICO });
    expect(css).toContain(':root{--primary:215 28% 17%;--primary-foreground:0 0% 100%;--ring:215 28% 17%;');
    expect(css).toMatch(/^:root\{.*\}\.dark\{--primary:215 28% \d+%;--primary-foreground:220 30% 8%;/);
  });

  it('sin primario válido deja los colores de serie', () => {
    const css = themeCss({ primaryColor: 'nada' });
    expect(css).not.toContain('--primary');
    expect(css).not.toContain('.dark');
  });

  it('aplica el secundario, el redondeo y la tipografía', () => {
    const css = themeCss({ secondaryColor: '#ffffff', borderRadius: 2, font: 'Lato' });
    expect(css).toContain('--secondary:0 0% 100%;');
    expect(css).toContain('--radius:2px;--radius-sm:0px;--radius-md:0px;--radius-lg:2px;--radius-xl:6px;');
    expect(css).toContain('--font-sans:var(--font-lato), ui-sans-serif, system-ui, sans-serif;');
    expect(css).toContain('body{font-family:var(--font-lato), ui-sans-serif, system-ui, sans-serif;}');
  });
});

/**
 * `public/theme-preload.js` repite `themeCss()` para pintar antes de que React monte. Si se
 * desincronizan, la página cambia de color al hidratarse; esto lo impide.
 */
describe('precarga del tema', () => {
  const source = readFileSync(join(__dirname, '../../public/theme-preload.js'), 'utf8');

  function runPreload(storage: Record<string, string> | 'bloqueado'): string | null {
    let written: { textContent?: string } | null = null;
    runInNewContext(source, {
      localStorage: {
        getItem: (key: string) => {
          if (storage === 'bloqueado') throw new Error('Almacenamiento bloqueado');
          return storage[key] ?? null;
        },
      },
      document: {
        createElement: () => ({}),
        head: { appendChild: (element: { textContent?: string }) => (written = element) },
      },
    });
    return (written as { textContent?: string } | null)?.textContent ?? null;
  }

  const cached = (country: string, theme: CountryTheme) => ({
    lms_country: country,
    [`lms_config_${country}`]: JSON.stringify(theme),
  });

  it.each<CountryTheme>([
    { primaryColor: MEXICO, secondaryColor: '#d97706', borderRadius: 12 },
    { primaryColor: COLOMBIA, borderRadius: 0 },
    { primaryColor: '#fde047', secondaryColor: '#06b6d4', borderRadius: 24 },
    { primaryColor: '#0000ff' },
    { primaryColor: 'nada', borderRadius: 8 },
  ])('produce la misma hoja que theme.ts para %j', (theme) => {
    expect(runPreload(cached('MEXICO', theme))).toBe(themeCss(theme));
  });

  it('sin caché pinta la marca de la sede guardada', () => {
    expect(runPreload({ lms_country: 'MEXICO' })).toBe(themeCss({ primaryColor: MEXICO }));
  });

  it('sin sede guardada, o con una manipulada, pinta la de partida', () => {
    expect(runPreload({})).toBe(themeCss({ primaryColor: COLOMBIA }));
    expect(runPreload({ lms_country: 'PERU' })).toBe(themeCss({ primaryColor: COLOMBIA }));
  });

  it('con el almacenamiento bloqueado también pinta la marca de partida', () => {
    expect(runPreload('bloqueado')).toBe(themeCss({ primaryColor: COLOMBIA }));
  });
});
