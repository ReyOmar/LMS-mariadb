'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { BrandMark } from './BrandMark';

/** Desplazamiento a partir del cual la cabecera deja de ser transparente. */
const SOLID_AFTER_PX = 50;

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

const NAV_LINK = 'hidden md:inline hover:text-primary transition-colors';

export function LandingHeader({
  logoUrl,
  platformName,
  hasContact,
}: {
  logoUrl: string | null;
  platformName: string;
  hasContact: boolean;
}) {
  const solid = useScrolledPast(SOLID_AFTER_PX);

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        solid ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 font-bold text-xl text-primary">
          <BrandMark logoUrl={logoUrl} />
          <span className="hidden sm:inline truncate">{platformName}</span>
        </div>

        <nav
          aria-label="Principal"
          className="flex items-center gap-2 sm:gap-4 md:gap-8 shrink-0 text-sm font-medium text-muted-foreground"
        >
          <a href="#services" className={NAV_LINK}>
            Servicios
          </a>
          <a href="#features" className={NAV_LINK}>
            Plataforma
          </a>
          {hasContact && (
            <a href="#contact" className={NAV_LINK}>
              Contacto
            </a>
          )}

          <CountryIndicator />

          {/* En un móvil estrecho la flecha no cabe junto a la sede. */}
          <Link
            href="/login"
            className="bg-primary text-primary-foreground px-3 sm:px-5 md:px-6 py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-all hover:scale-105 shadow-lg shadow-primary/25 whitespace-nowrap"
          >
            Ingresar <ArrowRight className="hidden sm:inline h-4 w-4 ml-1" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
