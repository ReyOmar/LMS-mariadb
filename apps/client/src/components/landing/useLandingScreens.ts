'use client';

import { useEffect, useState, type RefObject } from 'react';
import { screenProgress, type ScreenId } from './screens';

/**
 * El avance del desplazamiento, en pantallas. Cambia en cada imagen, así que no pasa por el
 * estado de React: quien lo necesita (la vitrina, el carril) se suscribe y escribe en el DOM.
 */
export interface ScrollProgress {
  current(): number;
  subscribe(listener: (progress: number) => void): () => void;
}

function createScrollProgress() {
  let value = 0;
  const listeners = new Set<(progress: number) => void>();
  const progress: ScrollProgress = {
    current: () => value,
    subscribe(listener) {
      listeners.add(listener);
      listener(value);
      return () => listeners.delete(listener);
    },
  };
  const set = (next: number) => {
    value = next;
    for (const listener of listeners) listener(next);
  };
  return { progress, set };
}

/**
 * Las pantallas de la portada: cuál está activa (la que cruza la mitad de la ventana), el avance
 * del desplazamiento y el ajuste a cada pantalla. Su contenido aparece en cuanto asoma
 * (`data-shown`) y se rearma sólo cuando salió del todo: nunca se ve en blanco.
 */
export function useLandingScreens(root: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<ScreenId>('inicio');
  const [{ progress, set: setProgress }] = useState(createScrollProgress);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const html = document.documentElement;
    const screens = Array.from(element.querySelectorAll<HTMLElement>('.screen'));
    html.classList.add('landing-snap');

    const center = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id as ScreenId);
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.15) entry.target.setAttribute('data-shown', '');
          else if (!entry.isIntersecting) entry.target.removeAttribute('data-shown');
        }
      },
      { threshold: [0, 0.15] },
    );

    // Las posiciones se guardan y se renuevan cuando cambia el alto de una pantalla (la ventana,
    // las fuentes, los textos de la sede): leerlas en cada imagen obligaría a maquetar.
    let tops: number[] = [];
    const measure = () => {
      tops = screens.map((screen) => screen.offsetTop);
      // Con alguna pantalla más alta que la ventana el ajuste es suave: el obligatorio no dejaría
      // salir de ella con la rueda.
      const tall = screens.slice(0, -1).some((screen) => screen.offsetHeight > window.innerHeight + 1);
      html.classList.toggle('has-tall-screens', tall);
    };
    let queued = false;
    const update = () => {
      queued = false;
      setProgress(screenProgress(window.scrollY, tops));
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    const resized = new ResizeObserver(() => {
      measure();
      schedule();
    });

    for (const screen of screens) {
      center.observe(screen);
      reveal.observe(screen);
      resized.observe(screen);
    }
    measure();
    update();
    window.addEventListener('scroll', schedule, { passive: true });

    return () => {
      window.removeEventListener('scroll', schedule);
      center.disconnect();
      reveal.disconnect();
      resized.disconnect();
      html.classList.remove('landing-snap', 'has-tall-screens');
    };
  }, [root, setProgress]);

  return { active, progress };
}
