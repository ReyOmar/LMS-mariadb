'use client';

import { useEffect, useRef } from 'react';
import { REDUCED_MOTION, useMediaQuery } from '@/hooks/useMediaQuery';
import { SCREENS, type ScreenId } from './screens';
import type { ScrollProgress } from './useLandingScreens';

/**
 * El carril de pantallas (desde 1100 px): un vehículo avanza por la línea ámbar a la par que el
 * desplazamiento, y cada parada lleva a su pantalla.
 */
export function ScreenLane({ active, progress }: { active: ScreenId; progress: ScrollProgress }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);

  useEffect(
    () =>
      progress.subscribe((value) =>
        trackRef.current?.style.setProperty('--at', (value / (SCREENS.length - 1)).toFixed(4)),
      ),
    [progress],
  );

  const go = (id: ScreenId) =>
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });

  return (
    <nav className="lane" aria-label="Pantallas">
      <div className="lane-track" ref={trackRef}>
        <span className="lane-car" aria-hidden="true" />
        <div className="lane-stops">
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              type="button"
              aria-label={screen.label}
              aria-current={active === screen.id ? 'true' : undefined}
              onClick={() => go(screen.id)}
            >
              <span aria-hidden="true">{screen.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
