import { MAX_SCORE, MIN_SCORE } from '@/lib/grading';

/** Lo que se guarda al salir de un campo de la ficha del curso, o por qué no se puede. */
export type FieldInput<T> = T | { error: string };

export function isFieldError<T extends object>(input: FieldInput<T>): input is { error: string } {
  return 'error' in input;
}

/** Cupo: vacío es «sin límite»; si no, un entero de al menos un estudiante (0 cerraría el curso a todos). */
export function parseCapacity(typed: string): FieldInput<{ maxStudents: number | null }> {
  const text = typed.trim();
  if (!text) return { maxStudents: null };

  const capacity = Number(text);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { error: 'El cupo debe ser un número entero de al menos 1 estudiante.' };
  }
  return { maxStudents: capacity };
}

/** Nota mínima para aprobar: obligatoria y en la escala de notas del sistema. */
export function parsePassingScore(typed: string): FieldInput<{ passingScore: number }> {
  const text = typed.trim();
  const score = Number(text);
  if (!text || !Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    return { error: `La nota mínima debe ser un número entero entre ${MIN_SCORE} y ${MAX_SCORE}.` };
  }
  return { passingScore: score };
}

/** Horas que acredita el certificado; vacío o no válido las deja sin declarar. */
export function parseDurationHours(typed: string): { durationHours: number | null } {
  const hours = Number(typed);
  return { durationHours: Number.isFinite(hours) && hours > 0 ? Math.round(hours) : null };
}
