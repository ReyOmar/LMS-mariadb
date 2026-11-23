'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { useNavCounters } from './useNavCounters';

/**
 * Marco del panel: barra superior con las pestañas y, en el teléfono, barra inferior.
 * Los altos de las barras viven en variables de `globals.css` (`--shell-*`), que también usan
 * las pantallas que ocupan todo el alto disponible.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { role } = useSession();
  const pathname = usePathname() ?? '';
  // Un solo recuento para las dos barras: así no se piden dos veces ni pueden discrepar.
  const counters = useNavCounters(role, pathname);

  return (
    <div className="min-h-screen bg-muted/20">
      <a href="#main-content" className="skip-to-content">
        Saltar al contenido
      </a>
      <AppHeader counters={counters} />
      <main
        id="main-content"
        className="relative mx-auto min-h-[calc(100dvh-var(--shell-header))] w-full max-w-7xl overflow-hidden px-4 pb-[var(--shell-pad-bottom)] pt-[var(--shell-pad-top)] sm:px-6 lg:px-8"
      >
        {children}
      </main>
      <BottomNav counters={counters} />
    </div>
  );
}
