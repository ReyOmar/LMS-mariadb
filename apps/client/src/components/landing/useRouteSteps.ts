'use client';

import { useEffect, useState } from 'react';
import { REDUCED_MOTION, useMediaQuery } from '@/hooks/useMediaQuery';

/** Pasos de «Cómo funciona»: de la matrícula al certificado. */
export const ROUTE_STEP_COUNT = 4;
const FIRST_STEP_MS = 900;
const NEXT_STEP_MS = 1300;

/**
 * Cuántos pasos del recorrido van cumplidos (0 a 4). Mientras su pantalla está a la vista,
 * avanzan uno a uno a la par en la lista y en el curso de la vitrina; con «reducir
 * movimiento» aparecen todos a la vez.
 */
export function useRouteSteps(running: boolean): number {
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const [reached, setReached] = useState(0);

  useEffect(() => {
    if (!running) {
      setReached(0);
      return;
    }
    if (reducedMotion) {
      setReached(ROUTE_STEP_COUNT);
      return;
    }
    setReached(0);
    const timers = Array.from({ length: ROUTE_STEP_COUNT }, (_, index) =>
      setTimeout(() => setReached(index + 1), FIRST_STEP_MS + index * NEXT_STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [running, reducedMotion]);

  return reached;
}
