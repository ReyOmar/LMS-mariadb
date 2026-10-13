import { COLOR } from '@/components/ui/charts';
import { scoreDistribution, shortLabel, twoWayBreakdown } from './summary-charts';

const COURSE = { threshold: 80, borderline: 60, scores: { low: 200, mid: 400, high: 600 } };

describe('scoreDistribution', () => {
  it('describe los tramos respecto al umbral del curso, no a números sueltos', () => {
    expect(scoreDistribution(COURSE).map((range) => range.name)).toEqual([
      'Por debajo de 60',
      'Entre 60 y 79',
      '80 o más (aprobado)',
    ]);
  });

  it('sigue al umbral cuando el curso lo cambia', () => {
    const ranges = scoreDistribution({ ...COURSE, threshold: 70, borderline: 53 });

    expect(ranges.map((range) => range.name)).toEqual(['Por debajo de 53', 'Entre 53 y 69', '70 o más (aprobado)']);
  });

  it('usa los recuentos del servidor tal cual: son del curso entero, no de la página', () => {
    expect(scoreDistribution(COURSE).map((range) => range.count)).toEqual([200, 400, 600]);
  });

  it('oculta los tramos vacíos para no dibujar barras de altura cero', () => {
    const ranges = scoreDistribution({ ...COURSE, scores: { low: 0, mid: 0, high: 5 } });

    expect(ranges.map((range) => range.name)).toEqual(['80 o más (aprobado)']);
  });
});

describe('twoWayBreakdown', () => {
  const first = { name: 'A', value: 3, color: COLOR.passed };
  const second = { name: 'B', value: 0, color: COLOR.failed };

  it('no dibuja la porción que vale cero', () => {
    expect(twoWayBreakdown(first, second, 'Nada').map((slice) => slice.name)).toEqual(['A']);
  });

  it('sin nada que repartir devuelve una porción gris en lugar de un hueco', () => {
    expect(twoWayBreakdown({ ...first, value: 0 }, second, 'Nada')).toEqual([
      { name: 'Nada', value: 1, color: COLOR.empty },
    ]);
  });
});

describe('shortLabel', () => {
  it('recorta los títulos largos y deja los cortos', () => {
    expect(shortLabel('Manejo defensivo avanzado')).toBe('Manejo defensiv...');
    expect(shortLabel('Normativa')).toBe('Normativa');
  });
});
