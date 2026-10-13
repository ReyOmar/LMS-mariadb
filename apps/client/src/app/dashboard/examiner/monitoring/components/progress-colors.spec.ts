import { COLOR } from '@/components/ui/charts';
import { moduleColor, progressColor, progressTextColor } from './progress-colors';

describe('colores del avance', () => {
  it('la barra cambia en los mismos cortes y con los mismos colores que los tramos de la gráfica', () => {
    expect([0, 25, 26, 50, 51, 75, 76, 100].map(progressColor)).toEqual([
      COLOR.failed,
      COLOR.failed,
      COLOR.pending,
      COLOR.pending,
      COLOR.secondary,
      COLOR.secondary,
      COLOR.passed,
      COLOR.passed,
    ]);
  });

  it('el texto sigue al mismo tramo', () => {
    expect(progressTextColor(100)).toBe('text-emerald-700 dark:text-emerald-400');
    expect(progressTextColor(60)).toBe('text-sky-700 dark:text-sky-400');
    expect(progressTextColor(0)).toBe('text-red-700 dark:text-red-400');
  });

  it('un módulo sólo sale en verde cuando está terminado', () => {
    expect(moduleColor(100)).toContain('emerald');
    expect(moduleColor(99)).toContain('amber');
    expect(moduleColor(0)).toContain('muted');
  });
});
