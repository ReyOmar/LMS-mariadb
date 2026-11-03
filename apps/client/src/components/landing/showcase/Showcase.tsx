'use client';

import { useEffect, useRef } from 'react';
import { COUNTRY_INFO, type Country } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { REDUCED_MOTION, useMediaQuery } from '@/hooks/useMediaQuery';
import { SITE_STORIES } from '../landing-content';
import { SCREENS, type ScreenId } from '../screens';
import type { ScrollProgress } from '../useLandingScreens';
import type { Piece } from '../PlatformSection';
import { StudentView } from './StudentView';
import { SiteAdminView } from './SiteAdminView';
import { CourseView } from './CourseView';
import { PlatformView } from './PlatformView';
import { CertificateView } from './CertificateView';

const SLOTS = new Map<string, number>(SCREENS.map((screen, index) => [screen.id, index]));
/** Al cargar, las vistas llegan desde el fondo hasta su sitio. */
const ARRIVAL_OFFSET = 0.6;
/** Segundos que tarda la vista en recorrer la mayor parte de la distancia que le falta. */
const SMOOTHING_S = 0.14;

interface ViewState {
  element: HTMLElement;
  slot: number;
  pose: string;
  visible: boolean | null;
  current: boolean | null;
}

/**
 * Cada vista según su distancia a la pantalla actual: entre −1 y 0 llega desde el fondo; entre 0
 * y 1 sale hacia quien mira. Fuera de ese tramo no se ve ni se puede tocar. Sólo se escribe lo
 * que cambia: las vistas lejanas, quietas, no tocan el estilo.
 */
function place(views: ViewState[], progress: number) {
  for (const view of views) {
    const f = Math.min(1, Math.max(-1, progress - view.slot));
    const opacity = f <= 0 ? 1 + f : 1 - f;
    const o = opacity.toFixed(3);
    const dz = `${(f <= 0 ? f * 440 : f * 320).toFixed(1)}px`;
    const dy = `${(f > 0 ? -6 * f : 0).toFixed(2)}%`;
    const pose = `${o}|${dz}|${dy}`;
    if (view.pose !== pose) {
      view.pose = pose;
      view.element.style.setProperty('--o', o);
      view.element.style.setProperty('--dz', dz);
      view.element.style.setProperty('--dy', dy);
    }
    const visible = opacity > 0.01;
    if (view.visible !== visible) {
      view.visible = visible;
      view.element.style.visibility = visible ? 'visible' : 'hidden';
    }
    const current = Math.abs(progress - view.slot) < 0.5;
    if (view.current !== current) {
      view.current = current;
      view.element.toggleAttribute('data-current', current);
      view.element.inert = !current;
    }
  }
}

interface Props {
  progress: ScrollProgress;
  active: ScreenId;
  /** Desde 1100 px la vitrina acompaña al texto; por debajo sólo asoma su vista de inicio. */
  wide: boolean;
  platformName: string;
  country: Country;
  /** Pasos cumplidos del recorrido, que el curso de ejemplo sigue. */
  reached: number;
  /** La pieza de «Plataforma» que se señala. */
  focusedPiece: Piece | null;
}

/** La interfaz del campus en 3D, que pasa de una vista a otra al ritmo del desplazamiento. */
export function Showcase({ progress, active, wide, platformName, country, reached, focusedPiece }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const siteName = COUNTRY_INFO[country].name;
  const story = SITE_STORIES[country];
  const site = (
    <>
      <CountryFlag country={country} size="em" />
      {siteName}
    </>
  );

  // El avance pedido y el dibujado, que lo sigue suavizado. Con «reducir movimiento» la vista
  // cambia de golpe a la pantalla en curso, sin viajar en profundidad.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const views: ViewState[] = Array.from(stage.querySelectorAll<HTMLElement>('.view')).map((element) => ({
      element,
      slot: SLOTS.get(element.dataset.view ?? '') ?? 0,
      pose: '',
      visible: null,
      current: null,
    }));

    let target = progress.current();
    let shown = reducedMotion ? target : target - ARRIVAL_OFFSET;
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = 0;
      // Con el tiempo real entre imágenes, hasta 0,1 s: en un equipo lento la vista llega a su sitio
      // en el mismo tiempo, y tras una pausa larga (otra pestaña) no da un salto.
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const gap = target - shown;
      if (Math.abs(gap) > 0.0005) {
        shown += gap * (1 - Math.exp(-dt / SMOOTHING_S));
        frame = requestAnimationFrame(draw);
      } else {
        shown = target;
        last = 0;
      }
      place(views, shown);
    };
    const follow = (next: number) => {
      target = reducedMotion ? Math.round(next) : next;
      if (reducedMotion) {
        shown = target;
        place(views, shown);
      } else if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    };

    const unsubscribe = progress.subscribe(follow);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [progress, reducedMotion, wide]);

  // El ladeo sigue al puntero, a lo sumo una vez por imagen. Sólo con ratón y sin «reducir movimiento».
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !wide || reducedMotion || !window.matchMedia('(pointer: fine)').matches) return;
    let pointer: PointerEvent | null = null;
    let frame = 0;
    const tilt = () => {
      frame = 0;
      if (!pointer) return;
      stage.style.setProperty('--ry', `${(pointer.clientX / window.innerWidth - 0.5) * 6}deg`);
      stage.style.setProperty('--rx', `${(0.5 - pointer.clientY / window.innerHeight) * 4}deg`);
    };
    const onMove = (event: PointerEvent) => {
      pointer = event;
      if (!frame) frame = requestAnimationFrame(tilt);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
      stage.style.removeProperty('--rx');
      stage.style.removeProperty('--ry');
    };
  }, [wide, reducedMotion]);

  const reachedSteps = Array.from({ length: reached }, (_, index) => `reached-${index + 1}`).join(' ');

  return (
    // Por debajo de 1100 px es un fondo decorativo: nada en ella se enfoca ni se anuncia.
    <div className="stage-wrap" inert={!wide}>
      <div className="stage" ref={stageRef}>
        <div className="view" data-view="inicio" aria-hidden="true">
          <StudentView platformName={platformName} site={site} />
        </div>
        {/* Las demás vistas sólo existen donde se ven: en el móvil no se montan ni se dibujan. */}
        {wide && (
          <>
            <div className="view" data-view="servicios" aria-hidden="true">
              <SiteAdminView
                platformName={platformName}
                site={site}
                siteName={siteName}
                infraction={story.infraction}
              />
            </div>
            <div className={`view ${reachedSteps}`} data-view="ruta" aria-hidden="true">
              <CourseView reached={reached} infraction={story.infraction} />
            </div>
            <div
              className="view is-live"
              data-view="plataforma"
              data-focus={focusedPiece ?? undefined}
              role="group"
              aria-label="La plataforma por dentro"
            >
              <PlatformView siteName={siteName} quizRunning={active === 'plataforma'} />
            </div>
            <div className="view" data-view="verificar" aria-hidden="true">
              <CertificateView platformName={platformName} siteName={siteName} city={story.city} />
            </div>
          </>
        )}
      </div>
      <p className="stage-note">Vista de ejemplo</p>
    </div>
  );
}
