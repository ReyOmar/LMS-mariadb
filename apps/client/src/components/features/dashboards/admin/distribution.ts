import type { CourseBreakdown } from '@/types/models';

/** Una porción del reparto de matrículas. */
export interface EnrollmentSlice {
  key: string;
  name: string;
  value: number;
  /** Porcentaje entero sobre el total; los de todas las porciones suman 100. */
  percent: number;
}

/** Clave de la porción que agrupa lo que no aparece por separado. */
export const OTHERS_KEY = 'otros';

/**
 * Reparto de las matrículas de la sede por curso, para el anillo del panel.
 *
 * La API manda sólo los cursos publicados con más matrículas: lo demás (el resto de cursos
 * y los que están en borrador) se agrupa en «Otros» para que el anillo cuente todas. Los
 * porcentajes se reparten por el método del mayor resto, porque redondeados uno a uno
 * podrían sumar 99 % o 101 %.
 */
export function enrollmentDistribution(courses: readonly CourseBreakdown[], total: number): EnrollmentSlice[] {
  const slices = courses.map((course) => ({ key: course.guid, name: course.name, value: course.enrollments }));
  const others = total - slices.reduce((sum, slice) => sum + slice.value, 0);
  if (others > 0) slices.push({ key: OTHERS_KEY, name: 'Otros', value: others });

  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  if (sum === 0) return slices.map((slice) => ({ ...slice, percent: 0 }));

  const exact = slices.map((slice) => (slice.value * 100) / sum);
  const percents = exact.map(Math.floor);
  let missing = 100 - percents.reduce((acc, value) => acc + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - percents[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (missing <= 0) break;
    percents[index] += 1;
    missing -= 1;
  }

  return slices.map((slice, index) => ({ ...slice, percent: percents[index] }));
}
