/**
 * Presentación de las calificaciones — espejo de `common/domain/grading.ts` en la API.
 *
 * Todo el sistema puntúa sobre 100 y se aprueba con 80 salvo que el curso indique otro
 * umbral. Ninguna pantalla escribe la escala a mano: la toma de aquí.
 */

import { formatNumber, type Country } from './country';

export const MIN_SCORE = 0;
export const MAX_SCORE = 100;
export const DEFAULT_PASSING_SCORE = 80;

/** Convierte a número una nota que puede llegar como string, null o undefined. */
export function toScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** ¿Llega la nota al umbral? Sin nota, no aprueba. */
export function isPassing(score: unknown, threshold: number = DEFAULT_PASSING_SCORE): boolean {
  const num = toScore(score);
  return num !== null && num >= threshold;
}

/**
 * Sólo el número, con punto decimal: `85`, `87.5`, `—` si no hay nota. Sirve para rellenar
 * un campo o redondear una cifra; en pantalla, la nota se escribe con `formatScore`.
 */
export function formatPoints(score: unknown): string {
  const num = toScore(score);
  if (num === null) return '—';
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

/** Nota con su escala, con los decimales de la sede: `87,5 / 100` en Colombia. */
export function formatScore(score: unknown, country: Country): string {
  const num = toScore(score);
  if (num === null) return 'Sin calificar';
  return `${formatNumber(num, country)} / ${MAX_SCORE}`;
}

/** Sólo la cifra, con los decimales de la sede: `87,5` en Colombia, `—` si no hay nota. */
export function formatScoreValue(score: unknown, country: Country): string {
  const num = toScore(score);
  return num === null ? '—' : formatNumber(num, country);
}

/**
 * Media de las notas que existen, o `null` si no hay ninguna.
 *
 * Un cero es una nota y cuenta; lo que no cuenta es la ausencia de nota.
 */
export function averageScore(scores: readonly unknown[]): number | null {
  const valid = scores.map(toScore).filter((score): score is number => score !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, score) => sum + score, 0) / valid.length;
}

/** Porcentaje entero para barras de progreso y anillos. */
export function percent(score: unknown): number {
  const num = toScore(score);
  if (num === null) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

/**
 * Color semántico de una nota, en clases de Tailwind.
 * Aprobado en verde, cerca del umbral en ámbar y claramente insuficiente en rojo.
 */
export function scoreColor(score: unknown, threshold: number = DEFAULT_PASSING_SCORE): string {
  const num = toScore(score);
  if (num === null) return 'text-muted-foreground';
  if (num >= threshold) return 'text-emerald-700 dark:text-emerald-400';
  if (num >= threshold * 0.75) return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}
