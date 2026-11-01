import { pollInterval, spread } from './poll';

/** Tras un reinicio de la API, cada navegador vuelve en un momento distinto. */
describe('spread', () => {
  it('reparte la espera entre la mitad y el total', () => {
    expect(spread(4_000, () => 0)).toBe(2_000);
    expect(spread(4_000, () => 0.5)).toBe(3_000);
    expect(spread(4_000, () => 0.999)).toBeLessThan(4_000);
  });
});

/** El servidor espacia las consultas cuando hay mucha gente conectada. */
describe('pollInterval', () => {
  it('a la vista pregunta cada 4 s, salvo que el servidor pida esperar más', () => {
    expect(pollInterval(4_000, true)).toBe(4_000);
    expect(pollInterval(10_000, true)).toBe(10_000);
  });

  it('en segundo plano nunca pregunta más a menudo que cada 30 s', () => {
    expect(pollInterval(4_000, false)).toBe(30_000);
    expect(pollInterval(30_000, false)).toBe(30_000);
  });
});
