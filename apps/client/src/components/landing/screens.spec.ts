import { screenProgress, SCREENS } from './screens';

/** Seis pantallas de 800 px, una tras otra. */
const TOPS = [0, 800, 1600, 2400, 3200, 4000];

describe('avance de la portada, en pantallas', () => {
  it('arriba del todo es la primera pantalla', () => {
    expect(screenProgress(0, TOPS)).toBe(0);
  });

  it('a medio camino entre dos pantallas queda en medio', () => {
    expect(screenProgress(1200, TOPS)).toBe(1.5);
  });

  it('justo al empezar una pantalla es su número', () => {
    expect(screenProgress(2400, TOPS)).toBe(3);
  });

  it('desde la última pantalla ya no avanza, aunque quede página por debajo', () => {
    expect(screenProgress(4000, TOPS)).toBe(5);
    expect(screenProgress(4600, TOPS)).toBe(5);
  });

  it('con una pantalla más alta que las demás, el avance se reparte en su alto', () => {
    expect(screenProgress(1100, [0, 800, 1400, 2200])).toBe(1.5);
  });

  it('sin pantallas medidas todavía, empieza en la primera', () => {
    expect(screenProgress(300, [])).toBe(0);
  });

  it('cada pantalla tiene su ancla y su nombre', () => {
    expect(SCREENS.map((screen) => screen.id)).toEqual([
      'inicio',
      'servicios',
      'ruta',
      'plataforma',
      'verificar',
      'contacto',
    ]);
    expect(new Set(SCREENS.map((screen) => screen.label)).size).toBe(SCREENS.length);
  });
});
