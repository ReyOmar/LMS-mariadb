import { DEFAULT_POOL_SIZE, MAX_POOL_SIZE, poolSettings, readPoolSize } from './pool-settings';

describe('readPoolSize', () => {
  it('sin valor usa el tamaño por defecto sin avisar', () => {
    expect(readPoolSize(undefined)).toEqual({ size: DEFAULT_POOL_SIZE, warning: null });
    expect(readPoolSize('  ')).toEqual({ size: DEFAULT_POOL_SIZE, warning: null });
  });

  it('acepta un entero positivo', () => {
    expect(readPoolSize(' 5 ')).toEqual({ size: 5, warning: null });
  });

  it('ignora con aviso lo que no es un entero positivo', () => {
    for (const raw of ['cinco', '0', '-3', '2.5']) {
      const { size, warning } = readPoolSize(raw);
      expect(size).toBe(DEFAULT_POOL_SIZE);
      expect(warning).toContain('DATABASE_POOL_SIZE');
    }
  });

  it('recorta con aviso un valor desmedido', () => {
    const { size, warning } = readPoolSize('500');
    expect(size).toBe(MAX_POOL_SIZE);
    expect(warning).toContain('máximo');
  });
});

describe('poolSettings', () => {
  it('fija todos los límites en vez de heredar los del driver', () => {
    expect(poolSettings(10)).toEqual({
      connectionLimit: 10,
      minimumIdle: 2,
      idleTimeout: 50,
      acquireTimeout: 10_000,
      queryTimeout: 15_000,
    });
  });

  it('no conserva más conexiones ociosas de las que permite el pool', () => {
    expect(poolSettings(1).minimumIdle).toBe(1);
  });

  it('cierra las conexiones sobrantes antes de que lo haga el servidor', () => {
    // `idleTimeout` va en segundos: 50 000 las dejaría abiertas casi 14 horas.
    expect(poolSettings(10).idleTimeout).toBeLessThan(60);
  });
});
