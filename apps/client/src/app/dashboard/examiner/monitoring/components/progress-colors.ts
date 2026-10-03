/** Colores del avance: rojo apenas empezado, ámbar, azul y verde casi terminado. */

export function barColor(percent: number): string {
  if (percent >= 76) return 'bg-emerald-500';
  if (percent >= 51) return 'bg-blue-500';
  if (percent >= 26) return 'bg-amber-500';
  return 'bg-red-400';
}

export function textColor(percent: number): string {
  if (percent >= 76) return 'text-emerald-700 dark:text-emerald-400';
  if (percent >= 51) return 'text-blue-700 dark:text-blue-400';
  if (percent >= 26) return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

/** Casilla del número de módulo: verde terminado, ámbar empezado, gris sin empezar. */
export function moduleColor(percent: number): string {
  if (percent >= 100) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (percent > 0) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}
