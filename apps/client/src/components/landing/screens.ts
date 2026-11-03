import type { CSSProperties } from 'react';

/** Las pantallas de la portada, en orden. Su `id` es el ancla de cada una (`/#verificar`). */
export const SCREENS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'servicios', label: 'Funciones' },
  { id: 'ruta', label: 'Cómo funciona' },
  { id: 'plataforma', label: 'Plataforma' },
  { id: 'verificar', label: 'Verificar' },
  { id: 'contacto', label: 'Contacto' },
] as const;

export type ScreenId = (typeof SCREENS)[number]['id'];

/** Desde este ancho la vitrina acompaña al texto; por debajo sólo asoma en la portada. */
export const WIDE_SCREEN = '(min-width: 1100px)';

/**
 * Cuánto se ha recorrido, en pantallas: 1,5 es a medio camino entre la segunda y la tercera.
 * `tops` son las posiciones de cada pantalla, de arriba abajo.
 */
export function screenProgress(scrollY: number, tops: readonly number[]): number {
  if (tops.length === 0) return 0;
  let index = 0;
  while (index < tops.length - 1 && scrollY >= tops[index + 1]) index++;
  if (index === tops.length - 1) return index;
  const span = tops[index + 1] - tops[index];
  return index + Math.min(1, Math.max(0, (scrollY - tops[index]) / span));
}

/** Turno de un elemento en la entrada escalonada de su pantalla (`data-enter`). */
export function enterDelay(turn: number): CSSProperties {
  return { '--d': turn } as CSSProperties;
}
