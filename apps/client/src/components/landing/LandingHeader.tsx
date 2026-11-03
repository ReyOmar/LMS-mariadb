'use client';

import { useEffect, useState } from 'react';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { BrandMark } from './BrandMark';
import { SCREENS, type ScreenId } from './screens';
import { WindowLink } from './WindowLink';

/** Desplazamiento a partir del cual la cabecera deja de ser transparente. */
const SOLID_AFTER_PX = 40;

function useScrolledPast(offset: number): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > offset);
    // Al recargar a media página el navegador restaura el desplazamiento sin avisar.
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [offset]);

  return scrolled;
}

/** La cabecera fija: la marca, las pantallas (desde 1100 px), la sede y el acceso. */
export function LandingHeader({
  logoUrl,
  platformName,
  active,
  onSignIn,
}: {
  logoUrl: string | null;
  platformName: string;
  active: ScreenId;
  onSignIn: () => void;
}) {
  const solid = useScrolledPast(SOLID_AFTER_PX);

  return (
    <header className={`site-header ${solid ? 'is-solid' : ''}`}>
      <div className="wrap header-row">
        <a className="brand" href="#inicio">
          <BrandMark logoUrl={logoUrl} />
          <span className="brand-name">{platformName}</span>
        </a>
        <nav className="main-nav" aria-label="Principal">
          {SCREENS.slice(1).map((screen) => (
            <a key={screen.id} href={`#${screen.id}`} aria-current={active === screen.id ? 'true' : undefined}>
              {screen.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <CountryIndicator />
          <WindowLink href="/login" onOpen={onSignIn} className="btn btn-primary btn-sm">
            Ingresar
          </WindowLink>
        </div>
      </div>
    </header>
  );
}
