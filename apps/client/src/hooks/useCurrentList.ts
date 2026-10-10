import { useState } from 'react';

/** Lleva la cuenta de qué lista está a la vista: ver {@link useCurrentList}. */
export function listTracker() {
  let generation = 0;
  const stillCurrent = (expected: number) => () => expected === generation;

  return {
    /** Se pide una lista nueva: lo que llegue de las anteriores deja de valer. */
    start: () => stillCurrent(++generation),
    /** Se pide algo más de la lista a la vista: la página siguiente o un refresco. */
    extend: () => stillCurrent(generation),
  };
}

export type ListTracker = ReturnType<typeof listTracker>;

/**
 * Distingue las respuestas de la lista que está a la vista de las que llegan tarde. Al
 * cambiar deprisa de curso, filtro o búsqueda, una respuesta de la lista anterior no debe
 * pisar la nueva ni mezclarse con ella:
 *
 *     const isCurrent = list.start(); // o list.extend() para la página siguiente
 *     const { data } = await api.get(…);
 *     if (!isCurrent()) return;
 */
export function useCurrentList(): ListTracker {
  const [tracker] = useState(listTracker);
  return tracker;
}
