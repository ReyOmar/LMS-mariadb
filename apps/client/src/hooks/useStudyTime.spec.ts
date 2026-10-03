import { countsAsStudy } from './useStudyTime';

/**
 * Qué cuenta como tiempo de capacitación.
 *
 * La cifra que sale de aquí aparece en el panel del alumno y en el seguimiento del
 * examinador. Si cuenta de más, una pestaña olvidada durante la comida se convierte en
 * horas de formación que nadie hizo; si cuenta de menos, alguien que lee un texto largo
 * sin tocar nada deja de acumular el tiempo que sí está dedicando.
 */

const MINUTE = 60_000;
const now = new Date('2026-01-01T10:00:00Z').getTime();

describe('countsAsStudy', () => {
  it('cuenta mientras hay interacción reciente', () => {
    expect(countsAsStudy(now, now, false)).toBe(true);
    expect(countsAsStudy(now, now - MINUTE, false)).toBe(true);
  });

  it('deja de contar tras dos minutos sin tocar nada', () => {
    expect(countsAsStudy(now, now - 2 * MINUTE, false)).toBe(true);
    expect(countsAsStudy(now, now - 2 * MINUTE - 1, false)).toBe(false);
    expect(countsAsStudy(now, now - 30 * MINUTE, false)).toBe(false);
  });

  it('no cuenta con la pestaña en segundo plano, por reciente que sea la interacción', () => {
    expect(countsAsStudy(now, now, true)).toBe(false);
  });

  it('una pestaña abierta toda la noche no suma nada', () => {
    const eightHours = 8 * 60 * MINUTE;
    expect(countsAsStudy(now + eightHours, now, false)).toBe(false);
  });
});
