import { DEFAULT_PASSING_SCORE } from '@/lib/grading';
import { averageLabel, averageTone } from './average';

describe('calificación media de la sede', () => {
  it('sin notas no hay nada que valorar', () => {
    expect(averageLabel(null)).toBe('Todavía sin calificaciones');
    expect(averageTone(null)).toBe('neutral');
  });

  it('se compara con el umbral de aprobación', () => {
    expect(averageLabel(DEFAULT_PASSING_SCORE)).toMatch(/Por encima/);
    expect(averageTone(DEFAULT_PASSING_SCORE)).toBe('success');
    expect(averageLabel(DEFAULT_PASSING_SCORE - 1)).toMatch(/Por debajo/);
    expect(averageTone(DEFAULT_PASSING_SCORE - 1)).toBe('warning');
  });

  it('desde 90 es un rendimiento excelente', () => {
    expect(averageLabel(90)).toBe('Rendimiento excelente');
  });
});
