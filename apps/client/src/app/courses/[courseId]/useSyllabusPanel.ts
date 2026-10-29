'use client';

import { useEffect, useState } from 'react';
import { readLocal, writeLocal } from '@/lib/local-storage';

/** Recuerda si el temario se dejó abierto en pantalla ancha. */
const OPEN_KEY = 'lms_sidebar_open';

/** Por debajo de `lg` el temario flota sobre el contenido y lo tapa. */
const NARROW_SCREEN = '(max-width: 1023px)';

function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_SCREEN).matches;
}

/**
 * Temario plegable del visor. En pantalla ancha se recuerda la preferencia; en la estrecha nace
 * plegado y se pliega al elegir un recurso, porque si no tapa lo que se acaba de abrir.
 */
export function useSyllabusPanel() {
  const [narrow, setNarrow] = useState(isNarrowScreen);
  const [open, setOpen] = useState(() => !isNarrowScreen() && readLocal(OPEN_KEY) !== 'false');

  // Sólo al cruzar el límite: en el móvil, ocultar la barra de direcciones también cambia el tamaño.
  useEffect(() => {
    const query = window.matchMedia(NARROW_SCREEN);
    const onChange = (event: MediaQueryListEvent) => {
      setNarrow(event.matches);
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!narrow) writeLocal(OPEN_KEY, String(next));
  };

  return {
    narrow,
    open,
    toggle,
    close: () => setOpen(false),
    closeIfNarrow: () => {
      if (narrow) setOpen(false);
    },
  };
}
