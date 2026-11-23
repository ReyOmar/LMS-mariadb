'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Cierra un menú desplegable al pulsar fuera de él o con Escape.
 *
 * `container` envuelve el botón que lo abre, que va primero, y el propio menú: así, pulsar el
 * botón con el menú abierto lo cierra con su propio manejador en lugar de cerrarlo aquí y
 * reabrirlo allí. Si se cierra con Escape desde dentro del menú, el foco vuelve a ese botón en
 * lugar de perderse con el menú.
 */
export function useDismiss(container: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const focusInside = container.current?.contains(document.activeElement) ?? false;
      onClose();
      if (focusInside) container.current?.querySelector<HTMLElement>('button')?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [container, open, onClose]);
}
