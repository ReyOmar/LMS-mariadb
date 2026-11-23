import { DEFAULT_PASSING_SCORE } from '@/lib/grading';
import { averageLabel } from './average';

describe('calificación media de la sede', () => {
  it('sin notas no hay nada que valorar', () => {
    expect(averageLabel(null)).toBe('Todavía sin calificaciones');
  });

  it('se compara con el umbral de aprobación', () => {
    expect(averageLabel(DEFAULT_PASSING_SCORE)).toMatch(/Por encima/);
    expect(averageLabel(DEFAULT_PASSING_SCORE - 1)).toMatch(/Por debajo/);
  });

  it('desde 90 es un rendimiento excelente', () => {
    expect(averageLabel(90)).toBe('Rendimiento excelente');
  });
});
