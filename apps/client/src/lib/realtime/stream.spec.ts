import { spread } from './stream';

/** Tras un reinicio de la API, cada navegador vuelve en un momento distinto. */
describe('spread', () => {
  it('reparte la espera entre la mitad y el total', () => {
    expect(spread(4_000, () => 0)).toBe(2_000);
    expect(spread(4_000, () => 0.5)).toBe(3_000);
    expect(spread(4_000, () => 0.999)).toBeLessThan(4_000);
  });
});
