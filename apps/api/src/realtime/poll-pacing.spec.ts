import { PollPacing } from './poll-pacing';

/**
 * Cuánto espera cada pestaña entre consultas: con poca gente, 4 s; con mucha o con el proceso
 * ocupado, más, sin pasar nunca de 30 s; y de vuelta, poco a poco, cuando se calma.
 */
describe('PollPacing', () => {
  /** Un proceso cuya carga se fija a mano, medición a medición. */
  const pacingWith = (...shares: number[]) => {
    const pending = [...shares];
    return new PollPacing(() => pending.shift() ?? 0);
  };

  it('con poca gente y el proceso desahogado, 4 s', () => {
    const pacing = pacingWith(0.2);
    pacing.measure();

    expect(pacing.interval(10)).toBe(4_000);
  });

  it('con mucha gente espacia las consultas para no pasar de las reservadas, en segundos enteros', () => {
    const pacing = pacingWith();

    expect(pacing.interval(1_400)).toBe(4_000);
    expect(pacing.interval(3_500)).toBe(10_000);
    expect(pacing.interval(3_501)).toBe(11_000);
  });

  it('nunca pide esperar más de 30 s, ni con una multitud ni con el proceso saturado', () => {
    const pacing = pacingWith(...Array<number>(20).fill(0.95));
    expect(pacing.interval(50_000)).toBe(30_000);

    for (let i = 0; i < 20; i++) pacing.measure();
    expect(pacing.interval(0)).toBe(30_000);
  });

  it('con el proceso ocupado alarga la espera en cada medición y, al calmarse, la recorta al mismo paso', () => {
    const pacing = pacingWith(0.9, 0.9, 0.3, 0.3);
    const after = () => {
      pacing.measure();
      return pacing.interval(0);
    };

    expect([after(), after()]).toEqual([6_000, 9_000]);
    expect([after(), after()]).toEqual([6_000, 4_000]);
  });

  it('entre el umbral de calma y el de ocupado no cambia nada, para que la espera no oscile', () => {
    const pacing = pacingWith(0.9, 0.72, 0.8, 0.84);
    for (let i = 0; i < 4; i++) pacing.measure();

    expect(pacing.interval(0)).toBe(6_000);
  });

  it('la gente y la carga no se suman: manda la mayor de las dos esperas', () => {
    const pacing = pacingWith(0.9);
    pacing.measure();

    expect(pacing.interval(1_000)).toBe(6_000);
    expect(pacing.interval(3_500)).toBe(10_000);
  });

  it('sin medidor propio mide el bucle de eventos de Node', () => {
    const pacing = new PollPacing();
    pacing.measure();

    expect(pacing.interval(0)).toBeGreaterThanOrEqual(4_000);
  });
});
