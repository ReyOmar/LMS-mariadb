import { DEFAULT_PASSING_SCORE } from '@/lib/grading';

/** Cómo se lee la calificación media de la sede frente al umbral de aprobación. */
export function averageLabel(average: number | null): string {
  if (average === null) return 'Todavía sin calificaciones';
  if (average >= 90) return 'Rendimiento excelente';
  return average >= DEFAULT_PASSING_SCORE
    ? `Por encima del umbral de ${DEFAULT_PASSING_SCORE} puntos`
    : `Por debajo del umbral de ${DEFAULT_PASSING_SCORE} puntos`;
}
