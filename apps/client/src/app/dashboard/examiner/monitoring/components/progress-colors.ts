import { COLOR } from '@/components/ui/charts';

/** Tramos de avance, en el orden en que la API cuenta los alumnos de cada uno (`summary.ranges`). */
export const PROGRESS_BANDS = [
  { from: 0, name: '0–25%', fill: COLOR.failed, text: 'text-red-700 dark:text-red-400' },
  { from: 26, name: '26–50%', fill: COLOR.pending, text: 'text-amber-700 dark:text-amber-400' },
  { from: 51, name: '51–75%', fill: COLOR.secondary, text: 'text-sky-700 dark:text-sky-400' },
  { from: 76, name: '76–100%', fill: COLOR.passed, text: 'text-emerald-700 dark:text-emerald-400' },
] as const;

function bandOf(percent: number) {
  return [...PROGRESS_BANDS].reverse().find((band) => percent >= band.from) ?? PROGRESS_BANDS[0];
}

/** Color de la barra de avance: el mismo que el tramo de la gráfica en el que cae. */
export function progressColor(percent: number): string {
  return bandOf(percent).fill;
}

export function progressTextColor(percent: number): string {
  return bandOf(percent).text;
}

/** Casilla del número de módulo: verde terminado, ámbar empezado, gris sin empezar. */
export function moduleColor(percent: number): string {
  if (percent >= 100) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (percent > 0) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}
