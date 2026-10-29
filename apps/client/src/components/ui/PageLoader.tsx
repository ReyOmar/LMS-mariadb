'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IDLE_SNAPSHOT, loaderMessage, loaderSession, type Box, type LoaderHandoff } from './loader-progress';

interface PageLoaderProps {
  message?: string;
}

const serverSnapshot = () => IDLE_SNAPSHOT;

/**
 * Indicador de carga de pantalla completa: `<PageLoader message="…" />`.
 *
 * Quien lo muestra sólo tiene que dejar de renderizarlo cuando termina la carga. Al irse,
 * `PageLoaderOverlay` (montado en la plantilla principal) lo sustituye en el mismo sitio,
 * completa la barra hasta 100 y lo desvanece sobre el contenido que ya ha llegado.
 */
export function PageLoader({ message = 'Cargando…' }: PageLoaderProps) {
  const { visible, progress } = useSyncExternalStore(
    loaderSession.subscribe,
    loaderSession.getSnapshot,
    serverSnapshot,
  );
  // Si ya había un indicador a la vista —otra pantalla de carga acaba de ceder el paso—,
  // éste aparece tal cual, sin volver a fundirse desde cero.
  const [fadeIn] = useState(() => !loaderSession.getSnapshot().visible);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    // Tampoco lo funden ni lo desplazan los contenedores que aparecen con él.
    if (root && !fadeIn) finishEntranceAnimations(root);
    loaderSession.start();
    // Se avisa en la limpieza «de maquetación» y no en la de un efecto normal: todavía se
    // ejecuta con el indicador en el documento, así que se puede medir, y la capa de cierre
    // se pinta en el mismo fotograma en que éste desaparece.
    return () => loaderSession.stop(() => (root ? describeHandoff(root) : null));
  }, [fadeIn]);

  // Durante la espera inicial se reserva el hueco y se prepara el indicador sin mostrarlo,
  // para que la aparición del contenido no dé un salto en la página y la barra pueda
  // crecer desde cero cuando se vea.
  return (
    <div
      ref={rootRef}
      className="min-h-[60vh] flex flex-col items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div
        data-loader-card
        className={
          visible ? (fadeIn ? 'animate-in fade-in duration-300 motion-reduce:animate-none' : undefined) : 'invisible'
        }
      >
        <LoaderCard progress={visible ? progress : 0} message={loaderMessage(message)} smooth />
      </div>
    </div>
  );
}

/** La espera cuando todavía no hay marco en el que pintarla: ocupa la ventana entera. */
export function FullScreenLoader({ message }: PageLoaderProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20">
      <PageLoader message={message} />
    </div>
  );
}

/**
 * El indicador en sí: logotipo, barra y mensaje. Lo comparten la pantalla de carga y la
 * capa de cierre para que el relevo entre ambas no se note.
 */
export function LoaderCard({ progress, message, smooth }: { progress: number; message: string; smooth: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // El anillo y el brillo se alinean con el reloj del documento: cuando un indicador
    // sustituye a otro, siguen en el mismo punto en lugar de reiniciarse con un salto.
    for (const animation of ref.current?.getAnimations?.({ subtree: true }) ?? []) {
      if (animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY) animation.startTime = 0;
    }
  }, []);

  return (
    <div ref={ref} className="flex flex-col items-center gap-6">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-ping motion-reduce:animate-none" />
      </div>

      <div className="w-56">
        <div data-loader-track className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            data-loader-bar
            className={`h-full rounded-full bg-primary relative overflow-hidden ${
              smooth ? 'transition-[width] duration-200 ease-out motion-reduce:transition-none' : ''
            }`}
            style={{ width: `${progress}%` }}
          >
            <div
              className="absolute inset-0 motion-reduce:hidden"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'pageLoaderShimmer 1.2s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      </div>

      <p data-loader-message className="text-sm font-medium text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

/** Lo que había en pantalla al irse el indicador, para que la capa de cierre lo repita. */
function describeHandoff(root: HTMLElement): LoaderHandoff | null {
  if (!root.isConnected) return null;

  const box = toBox(root.getBoundingClientRect());
  // Oculto (por ejemplo, dentro de un `Suspense` que se esconde): no hay nada que cerrar.
  if (box.width === 0 || box.height === 0) return null;

  const card = root.querySelector<HTMLElement>('[data-loader-card]');
  const track = root.querySelector<HTMLElement>('[data-loader-track]');
  const bar = root.querySelector<HTMLElement>('[data-loader-bar]');
  const text = root.querySelector<HTMLElement>('[data-loader-message]');

  // La cifra que se ve, no la última calculada: la barra puede estar a mitad de transición.
  const trackWidth = track?.getBoundingClientRect().width ?? 0;
  const shown = trackWidth > 0 && bar ? (bar.getBoundingClientRect().width / trackWidth) * 100 : 0;
  const opacity = card ? Number.parseFloat(getComputedStyle(card).opacity) : 1;

  const { element, fullPage } = loadingArea(root);
  return {
    shown,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    message: text?.textContent ?? '',
    area: fullPage ? viewportBox() : downToVisibleBottom(paddingBox(element), element),
    radius: fullPage ? '' : getComputedStyle(element).borderRadius,
    backgrounds: backgroundsOf(element),
    box,
  };
}

/**
 * Región de la pantalla que ocupaba la carga.
 *
 * Se sube por los contenedores que sólo envuelven al indicador: si la pantalla de carga
 * era todo lo que había en el área principal del panel, es esa área la que se cubre, y no
 * sólo la caja del indicador (se vería una franja de contenido nuevo alrededor). Si llega
 * al cuerpo del documento, la carga ocupaba la página entera y se cubre la ventana.
 */
function loadingArea(root: HTMLElement): { element: HTMLElement; fullPage: boolean } {
  let element = root;
  for (let level = 0; level < 4; level += 1) {
    const parent = element.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) {
      return { element, fullPage: true };
    }
    if (parent.childElementCount !== 1) break;
    element = parent;
  }
  return { element, fullPage: false };
}

/** Colores de fondo de la región y de todo lo que tiene detrás, del más externo al más interno. */
function backgroundsOf(element: HTMLElement): string[] {
  const layers: string[] = [];
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') layers.unshift(color);
  }
  return layers;
}

/** Caja interior (sin bordes) de un elemento: se cubre el fondo, no el marco. */
function paddingBox(element: HTMLElement): Box {
  // Con medidas fraccionarias: `clientWidth` redondea y dejaría asomar un píxel del contenido.
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const top = Number.parseFloat(style.borderTopWidth) || 0;
  const right = Number.parseFloat(style.borderRightWidth) || 0;
  const bottom = Number.parseFloat(style.borderBottomWidth) || 0;
  const left = Number.parseFloat(style.borderLeftWidth) || 0;
  return {
    top: rect.top + top,
    left: rect.left + left,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

/**
 * La región, alargada hasta donde deja de verse su contenedor (como mucho, el pie de la
 * ventana). El contenido que sustituye a la carga suele ser más alto que ella y, sin esto,
 * asomaría por debajo de la capa mientras la barra se completa.
 */
function downToVisibleBottom(box: Box, element: HTMLElement): Box {
  let bottom = window.innerHeight;
  for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
    if (getComputedStyle(current).overflowY !== 'visible') {
      bottom = Math.min(bottom, current.getBoundingClientRect().bottom);
      break;
    }
  }
  return { ...box, height: Math.max(box.height, bottom - box.top) };
}

function viewportBox(): Box {
  return { top: 0, left: 0, width: document.documentElement.clientWidth, height: window.innerHeight };
}

/**
 * Da por terminadas las animaciones de entrada de los contenedores del indicador (las CSS
 * que acaban; las transiciones y los bucles no se tocan).
 */
function finishEntranceAnimations(root: HTMLElement): void {
  for (let current = root.parentElement; current && current !== document.body; current = current.parentElement) {
    for (const animation of current.getAnimations?.() ?? []) {
      const finite = animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY;
      if ('animationName' in animation && finite) animation.finish();
    }
  }
}

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
