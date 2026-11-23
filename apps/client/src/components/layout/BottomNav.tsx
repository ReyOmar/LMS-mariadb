'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, X } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useDialog } from '@/hooks/useDialog';
import { NAVIGATION, PHONE_TABS, isActiveLink, isWithin, phoneMoreSections, type MenuSection } from './navigation';
import { NavCount, NavSectionList } from './NavParts';
import type { NavCounters } from './useNavCounters';

const ITEM =
  'relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors';

/**
 * Navegación del teléfono: las primeras pestañas del rol a un toque y «Más» con el resto, en una
 * hoja que sube desde abajo. En el ordenador no se pinta: allí están en la barra superior.
 */
export function BottomNav({ counters }: { counters: NavCounters }) {
  const { role } = useSession();
  const pathname = usePathname() ?? '';
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = NAVIGATION[role].tabs.slice(0, PHONE_TABS);
  const moreSections = phoneMoreSections(role);
  const moreActive = isWithin(moreSections, pathname);
  // Lo pendiente de lo que va dentro de «Más» se señala en el propio botón.
  const moreCount = moreSections
    .flatMap((section) => section.links)
    .reduce((total, link) => total + (link.counter ? counters[link.counter] : 0), 0);

  // Navegar cierra la hoja: si no, quedaría tapando la pantalla de destino.
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      <nav
        aria-label="Navegación"
        className="fixed inset-x-0 bottom-0 z-[105] border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="grid h-[4.25rem] auto-cols-fr grid-flow-col px-1">
          {tabs.map((link) => {
            const active = isActiveLink(link, pathname);
            const Icon = link.icon;
            return (
              <li key={link.href} className="flex">
                <Link
                  prefetch
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`${ITEM} flex-1 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? 'bg-primary/12' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate px-1">{link.short ?? link.label}</span>
                  <NavCount
                    value={link.counter ? counters[link.counter] : 0}
                    className="absolute left-[calc(50%+0.35rem)] top-1"
                  />
                </Link>
              </li>
            );
          })}
          {moreSections.length > 0 && (
            <li className="flex">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                className={`${ITEM} flex-1 ${moreActive ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full ${moreActive ? 'bg-primary/12' : ''}`}
                >
                  <LayoutGrid className="h-5 w-5" />
                </span>
                Más
                <NavCount value={moreCount} className="absolute left-[calc(50%+0.35rem)] top-1" />
              </button>
            </li>
          )}
        </ul>
      </nav>

      {moreOpen && <MoreSheet sections={moreSections} pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

/** Hoja con las secciones que no caben en la barra inferior. Es modal: se cierra con Escape o tocando fuera. */
function MoreSheet({
  sections,
  pathname,
  onClose,
}: {
  sections: MenuSection[];
  pathname: string;
  onClose: () => void;
}) {
  const { dialogProps, titleId } = useDialog<HTMLDivElement>({ onClose });

  return (
    <>
      <div
        className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
        data-keep-active
      />
      <div
        {...dialogProps}
        className="fixed inset-x-0 bottom-0 z-[130] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl animate-in slide-in-from-bottom-6 fade-in duration-200 lg:hidden"
      >
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="flex items-center justify-between px-3 pb-2">
          <h2 id={titleId} className="text-base font-bold">
            Más secciones
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="tap-target inline-flex items-center justify-center rounded-xl p-2 text-muted-foreground hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <NavSectionList sections={sections} pathname={pathname} />
      </div>
    </>
  );
}
