import { secondsUntil } from './useCountdown';

/**
 * La cuenta atrás se calcula contra la hora de fin, así que un temporizador frenado por
 * estar la pestaña en segundo plano no la desajusta.
 */
describe('secondsUntil', () => {
  const now = new Date('2026-01-01T10:00:00Z').getTime();

  it('redondea hacia arriba: mientras quede algo, el botón sigue bloqueado', () => {
    expect(secondsUntil(now + 60_000, now)).toBe(60);
    expect(secondsUntil(now + 59_001, now)).toBe(60);
    expect(secondsUntil(now + 1, now)).toBe(1);
  });

  it('llega a cero al cumplirse el plazo y no baja de ahí', () => {
    expect(secondsUntil(now, now)).toBe(0);
    expect(secondsUntil(now - 5_000, now)).toBe(0);
  });
});
