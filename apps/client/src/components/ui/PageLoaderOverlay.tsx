'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { LoaderCard } from './PageLoader';
import { FINISH_EASING, loaderSession, type LoaderFinish } from './loader-progress';

const currentFinish = () => loaderSession.getSnapshot().finish;
const noFinish = () => null;

/**
 * Cierre de las pantallas de carga.
 *
 * Una pantalla deja de renderizar su `PageLoader` en cuanto llegan los datos, así que el
 * indicador no puede completarse por sí mismo. Esta capa, montada una sola vez en la
 * plantilla principal, lo sustituye en el mismo fotograma y en el mismo sitio, lleva la
 * barra hasta 100 y se desvanece sobre el contenido, que ya está debajo.
 */
export function PageLoaderOverlay() {
  const finish = useSyncExternalStore(loaderSession.subscribe, currentFinish, noFinish);
  return finish ? <FinishingLoader key={finish.id} finish={finish} /> : null;
}

function FinishingLoader({ finish }: { finish: LoaderFinish }) {
  const coverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { from, timing, handoff } = finish;
  const { area, box } = handoff;
  const animated = timing.fill > 0;

  useLayoutEffect(() => {
    const cover = coverRef.current;
    const card = cardRef.current;
    const bar = card?.querySelector<HTMLElement>('[data-loader-bar]');
    const running: Animation[] = [];

    if (typeof cover?.animate !== 'function') {
      // Sin animaciones web (navegadores muy antiguos): la barra se ve completa y la capa se
      // retira al acabar el cierre.
      if (bar) bar.style.width = '100%';
      return;
    }

    if (animated && bar) {
      running.push(
        bar.animate([{ width: `${from}%` }, { width: '100%' }], {
          duration: timing.fill,
          easing: FINISH_EASING,
          fill: 'forwards',
        }),
      );
    }
    // Si el indicador todavía estaba apareciendo, termina de hacerlo mientras se completa.
    if (animated && card && handoff.opacity < 1) {
      running.push(
        card.animate([{ opacity: handoff.opacity }, { opacity: 1 }], { duration: timing.fill, fill: 'forwards' }),
      );
    }
    if (timing.fade > 0 && cover) {
      running.push(
        cover.animate([{ opacity: 1 }, { opacity: 0 }], {
          delay: timing.fill + timing.hold,
          duration: timing.fade,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      );
    }

    return () => running.forEach((animation) => animation.cancel());
  }, [animated, from, handoff.opacity, timing]);

  return (
    <div
      ref={coverRef}
      aria-hidden
      className="pointer-events-none fixed z-[100] overflow-hidden"
      style={{ top: area.top, left: area.left, width: area.width, height: area.height, borderRadius: handoff.radius }}
    >
      {/* El mismo fondo que tenía la región, para que el contenido nuevo no asome antes de tiempo. */}
      <div className="absolute inset-0 bg-background" />
      {handoff.backgrounds.map((color, index) => (
        <div key={index} className="absolute inset-0" style={{ backgroundColor: color }} />
      ))}

      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ top: box.top - area.top, left: box.left - area.left, width: box.width, height: box.height }}
      >
        <div ref={cardRef} style={{ opacity: animated ? handoff.opacity : 1 }}>
          <LoaderCard progress={animated ? from : 100} message={handoff.message} smooth={false} />
        </div>
      </div>
    </div>
  );
}
