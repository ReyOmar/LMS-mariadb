/**
 * Escala de calificación del LMS — fuente única de verdad.
 *
 * Todo el sistema califica sobre 100 puntos. Cualquier lugar que necesite una nota, un
 * umbral o su representación debe importar desde aquí.
 */

import { COUNTRY_METADATA, type Country } from './country';

/** Nota mínima posible. */
export const MIN_SCORE = 0;

/** Nota máxima posible. */
export const MAX_SCORE = 100;

/**
 * Umbral de aprobación por defecto para cursos nuevos.
 * Cada curso puede subirlo o bajarlo en `Course.passingScore`.
 */
export const DEFAULT_PASSING_SCORE = 80;

/** Decimales que se conservan al almacenar una nota. */
const DECIMALS = 2;

/**
 * Ajusta una nota al rango válido y a la precisión de almacenamiento.
 * Un valor no numérico (NaN, null tras un cast, etc.) se trata como 0 en lugar de
 * propagar NaN hasta la base de datos.
 */
export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCORE;
  const clamped = Math.min(MAX_SCORE, Math.max(MIN_SCORE, value));
  return Number(clamped.toFixed(DECIMALS));
}

/**
 * Convierte a número una nota que puede venir como `Decimal` de Prisma, string o null.
 * Devuelve `null` cuando no hay nota, para distinguir "sin calificar" de "sacó 0".
 */
export function toScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Umbral de aprobación efectivo de un curso.
 * Si el curso no lo define o guarda un valor corrupto, se usa el umbral por defecto:
 * nunca se deja pasar una entrega por un dato ausente.
 */
export function passingThreshold(coursePassingScore: unknown): number {
  const num = toScore(coursePassingScore);
  if (num === null || num < MIN_SCORE || num > MAX_SCORE) {
    return DEFAULT_PASSING_SCORE;
  }
  return num;
}

/** Indica si una nota alcanza el umbral. Sin nota nunca se aprueba. */
export function isPassing(score: unknown, threshold: number): boolean {
  const num = toScore(score);
  return num !== null && num >= threshold;
}

/**
 * Nota de un cuestionario a partir de aciertos.
 * Sin preguntas la nota es 0: un quiz vacío no puede aprobar a nadie.
 */
export function quizScore(correct: number, total: number): number {
  if (total <= 0) return MIN_SCORE;
  return normalizeScore((correct / total) * MAX_SCORE);
}

/** Promedio de un conjunto de notas. Devuelve `null` si no hay ninguna. */
export function averageOfScores(scores: readonly unknown[]): number | null {
  const values = scores.map(toScore).filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return normalizeScore(sum / values.length);
}

/**
 * Representación de una nota para el usuario final: `"85 / 100"`.
 * Se usa en correos, notificaciones y certificados para que el formato no diverja.
 */
export function formatScore(score: unknown, country: Country): string {
  const num = toScore(score);
  if (num === null) return 'sin calificar';
  return `${formatPoints(num, country)} / ${MAX_SCORE}`;
}

/**
 * Sólo el número, sin decimales innecesarios y con el separador de la sede, como lo
 * escribe la interfaz: `85`, `87,5` en Colombia, `87.5` en México.
 * Pensado para incrustar en frases donde la escala ya está clara por el contexto.
 */
export function formatPoints(score: unknown, country: Country): string {
  const num = toScore(score);
  if (num === null) return '—';
  return num.toLocaleString(`es-${COUNTRY_METADATA[country].iso}`, { maximumFractionDigits: 1 });
}
