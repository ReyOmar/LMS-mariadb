'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

/** El velo de una ventana de la portada: pulsarlo la cierra. */
export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="close-x" type="button" onClick={onClick} aria-label="Cerrar">
      <X className="i" />
    </button>
  );
}

/**
 * La rueda mueve el contenido de la ventana aunque el puntero esté en el velo, en la cabecera o
 * en un índice que no se desplaza: para el navegador, el velo no es parte de la ventana y la
 * página de detrás está bloqueada.
 */
export function useWheelInto(scroller: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = scroller.current;
      if (!target || !(event.target instanceof Element) || target.contains(event.target)) return;
      const ownScroll = event.target.closest('.toc');
      if (ownScroll && ownScroll.scrollHeight > ownScroll.clientHeight + 1) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1;
      target.scrollBy(0, event.deltaY * unit);
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, [scroller]);
}

/**
 * Pistas del desplazamiento de una hoja: si queda contenido abajo (un degradado lo avisa) y si ya
 * se bajó (la X se separa del texto con un borde). Se renuevan al desplazar y cuando cambia el
 * alto del contenido: otra vista, un error, la ventana.
 */
export function useScrollHints(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const [hints, setHints] = useState({ more: false, scrolled: false });

  useEffect(() => {
    const target = scroller.current;
    if (!target) return;
    const update = () => {
      const more = target.scrollTop + target.clientHeight < target.scrollHeight - 2;
      const scrolled = target.scrollTop > 4;
      setHints((current) => (current.more === more && current.scrolled === scrolled ? current : { more, scrolled }));
    };
    update();
    target.addEventListener('scroll', update, { passive: true });
    const sizes = new ResizeObserver(update);
    sizes.observe(target);
    if (content.current) sizes.observe(content.current);
    return () => {
      target.removeEventListener('scroll', update);
      sizes.disconnect();
    };
  }, [scroller, content]);

  return hints;
}
