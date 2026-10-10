import { useEffect, useRef } from 'react';

interface LeaveGuard {
  /** Lo que muestra el navegador al cerrar o recargar la pestaña. */
  warning: string;
  /** Se pulsó un enlace del campus: la pantalla decide si se va, y a dónde era. */
  onLeave: (destination: string) => void;
  /** Destinos que no cuentan como salir, como moverse dentro de la misma sección. */
  stays?: (destination: string) => boolean;
}

/**
 * Avisa antes de abandonar una pantalla con algo pendiente, por las dos salidas posibles:
 * cerrar o recargar la pestaña, donde sólo cabe el aviso del navegador, y pulsar un enlace,
 * que se detiene y se entrega a `onLeave`. Los enlaces se interceptan en captura porque los
 * del menú lateral son de Next y no pasan por la pantalla.
 */
export function useLeaveGuard(active: boolean, { warning, onLeave, stays }: LeaveGuard): void {
  const handlers = useRef({ onLeave, stays });
  handlers.current = { onLeave, stays };

  useEffect(() => {
    if (!active) return;

    const onTabClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };

    const onDocumentClick = (event: MouseEvent) => {
      const destination = inAppNavigation(event);
      if (!destination || handlers.current.stays?.(destination)) return;

      event.preventDefault();
      event.stopPropagation();
      handlers.current.onLeave(destination);
    };

    window.addEventListener('beforeunload', onTabClose);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onTabClose);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [active, warning]);
}

/**
 * Ruta del campus a la que lleva un clic en esta misma pestaña, o `null` si el clic no sale de
 * la pantalla por ahí: abre otra pestaña (`target`, Ctrl, Cmd, Mayús, botón central), descarga
 * un archivo o va a otro sitio, que ya avisa el navegador con `beforeunload`.
 */
function inAppNavigation(event: MouseEvent): string | null {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;

  const link = (event.target as HTMLElement).closest('a');
  const href = link?.getAttribute('href');
  if (!link || !href || href.startsWith('#') || link.hasAttribute('download')) return null;
  if (link.target && link.target !== '_self') return null;

  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
}
