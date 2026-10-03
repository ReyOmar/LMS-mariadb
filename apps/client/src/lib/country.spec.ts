import { DEFAULT_COUNTRY, isCountry, saveCountry, countryName, savedCountry, formatNumber } from './country';

/**
 * Sede que se muestra antes de iniciar sesión.
 *
 * El visitante entra directamente a una sede y la cambia desde el selector que está a la
 * vista. Lo que se fija aquí es que esa lectura **nunca** se quede sin sede —la portada se
 * quedaría en blanco— y que un valor manipulado no se cuele.
 */
describe('sede guardada en el navegador', () => {
  const store = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => void store.set(key, value),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => store.clear());

  it('devuelve la sede elegida la última vez', () => {
    saveCountry('MEXICO');
    expect(savedCountry()).toBe('MEXICO');
  });

  it('en la primera visita entra a la sede de partida, no a ninguna', () => {
    expect(savedCountry()).toBe(DEFAULT_COUNTRY);
  });

  it('un valor manipulado no se cuela como sede', () => {
    store.set('lms_pais', 'ARGENTINA');
    expect(savedCountry()).toBe(DEFAULT_COUNTRY);
  });

  it('con el almacenamiento bloqueado sigue habiendo sede', () => {
    // Modo privado: leer lanza. La portada tiene que pintarse igual.
    const blocked = {
      localStorage: {
        getItem: () => {
          throw new Error('almacenamiento bloqueado');
        },
        setItem: () => undefined,
      },
    };
    const original = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = blocked;

    expect(savedCountry()).toBe(DEFAULT_COUNTRY);

    (globalThis as { window?: unknown }).window = original;
  });
});

describe('reconocer una sede', () => {
  it.each([
    ['COLOMBIA', true],
    ['MEXICO', true],
    ['colombia', false],
    ['PERU', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('esPais(%p) → %p', (value, expected) => {
    expect(isCountry(value)).toBe(expected);
  });

  it('cada sede tiene su nombre legible', () => {
    expect(countryName('COLOMBIA')).toBe('Colombia');
    expect(countryName('MEXICO')).toBe('México');
  });
});

describe('cifras con el formato de la sede', () => {
  it('Colombia agrupa los miles con punto y escribe el decimal con coma', () => {
    expect(formatNumber(2069, 'COLOMBIA')).toBe('2.069');
    expect(formatNumber(83.25, 'COLOMBIA')).toBe('83,3');
  });

  it('México agrupa los miles con coma y escribe el decimal con punto', () => {
    expect(formatNumber(6023, 'MEXICO')).toBe('6,023');
    expect(formatNumber(83.2, 'MEXICO')).toBe('83.2');
  });

  it('las cifras pequeñas quedan como están', () => {
    expect(formatNumber(0, 'COLOMBIA')).toBe('0');
    expect(formatNumber(21, 'MEXICO')).toBe('21');
  });
});
