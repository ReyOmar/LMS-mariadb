import { enrollmentDistribution, OTHERS_KEY } from './distribution';

/**
 * El anillo «Distribución por curso» del panel de administración.
 *
 * La API sólo manda los cursos con más matrículas. Lo que se fija aquí es que el anillo
 * siga contando todas —el resto va a «Otros»— y que la leyenda sume exactamente 100 %.
 */
describe('reparto de matrículas por curso', () => {
  const course = (guid: string, enrollments: number) => ({ guid, name: guid, enrollments });

  it('agrupa en «Otros» las matrículas de los cursos que no vienen por separado', () => {
    const slices = enrollmentDistribution([course('a', 50), course('b', 30)], 100);

    expect(slices.map((slice) => [slice.key, slice.value])).toEqual([
      ['a', 50],
      ['b', 30],
      [OTHERS_KEY, 20],
    ]);
    expect(slices.find((slice) => slice.key === OTHERS_KEY)?.name).toBe('Otros');
  });

  it('sin nada fuera de la lista no añade «Otros»', () => {
    const slices = enrollmentDistribution([course('a', 3), course('b', 1)], 4);

    expect(slices.map((slice) => slice.key)).toEqual(['a', 'b']);
  });

  it('los porcentajes suman 100 aunque redondeados uno a uno no lo hagan', () => {
    // Tres tercios: redondeando cada uno saldría 33 + 33 + 33 = 99.
    const slices = enrollmentDistribution([course('a', 1), course('b', 1), course('c', 1)], 3);

    expect(slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
  });

  it('sin matrículas todo queda a cero', () => {
    expect(enrollmentDistribution([course('a', 0)], 0)).toEqual([{ key: 'a', name: 'a', value: 0, percent: 0 }]);
  });
});
