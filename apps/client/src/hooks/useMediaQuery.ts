'use client';

import { useEffect, useState } from 'react';

/** Si la ventana cumple la consulta de medios, al día con sus cambios. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Quien pidió a su sistema menos animación: los cambios ocurren de golpe. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
