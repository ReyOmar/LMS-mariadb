import { barColor, moduleColor, textColor } from './progress-colors';

describe('colores del avance', () => {
  it('cambian en los mismos cortes que los tramos de la gráfica', () => {
    expect([25, 26, 50, 51, 75, 76].map(barColor)).toEqual([
      'bg-red-400',
      'bg-amber-500',
      'bg-amber-500',
      'bg-blue-500',
      'bg-blue-500',
      'bg-emerald-500',
    ]);
    expect(textColor(100)).toBe('text-emerald-700 dark:text-emerald-400');
    expect(textColor(0)).toBe('text-red-700 dark:text-red-400');
  });

  it('un módulo sólo sale en verde cuando está terminado', () => {
    expect(moduleColor(100)).toContain('emerald');
    expect(moduleColor(99)).toContain('amber');
    expect(moduleColor(0)).toContain('muted');
  });
});
