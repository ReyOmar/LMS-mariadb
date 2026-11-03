'use client';

import '@/components/landing/landing.css';
import { useCountry } from '@/contexts/CountryContext';
import { FullScreenLoader } from '@/components/ui/PageLoader';
import { Landing } from '@/components/landing/Landing';

export default function LandingPage() {
  const { ready } = useCountry();

  // Enseñar una sede y cambiarla al instante siguiente sería peor que esperar a leer la guardada.
  if (!ready) {
    return <FullScreenLoader message="Cargando campus…" />;
  }

  return <Landing />;
}
