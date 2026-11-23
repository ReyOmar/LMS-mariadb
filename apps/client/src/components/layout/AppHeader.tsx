'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, GraduationCap, LogOut, Settings } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useDismiss } from '@/hooks/useDismiss';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PhotoOrInitials } from '@/components/ui/UserAvatar';
import { NotificationCenter } from '@/components/features/NotificationCenter';
import { AccountSettings } from '@/components/features/AccountSettings';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { NAVIGATION, ROLE_NAMES, isActiveLink, isWithin, type MenuLink, type MenuSection } from './navigation';
import { NavCount, NavSectionList } from './NavParts';
import type { NavCounters } from './useNavCounters';

/**
 * Barra superior del campus: la marca, las pestañas de cada rol con «Más» para lo que no cabe
 * y, a la derecha, la sede, los avisos, el tema y la cuenta. En el teléfono las pestañas van
 * abajo (`BottomNav`) y aquí quedan la marca, los avisos, el tema y la cuenta.
 */
export function AppHeader({ counters }: { counters: NavCounters }) {
  const { role } = useSession();
  const pathname = usePathname() ?? '';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { tabs, more } = NAVIGATION[role];

  return (
    <header className="sticky top-0 z-[110] border-b border-border/60 bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-[var(--shell-header)] max-w-7xl items-center gap-2 px-4 sm:px-6 lg:gap-3 lg:px-8">
        <Brand />

        <nav aria-label="Secciones" className="ml-2 hidden shrink-0 items-center gap-1 lg:flex xl:ml-5">
          {tabs.map((link) => (
            <TabLink
              key={link.href}
              link={link}
              active={isActiveLink(link, pathname)}
              count={link.counter ? counters[link.counter] : 0}
            />
          ))}
          {more.length > 0 && <MoreMenu sections={more} pathname={pathname} active={isWithin(more, pathname)} />}
        </nav>

        <span className="flex-1" />

        <div className="hidden xl:block">
          <CountryIndicator readOnly />
        </div>
        <NotificationCenter />
        {/* El tema se cambia sólo aquí, en el ordenador y en el teléfono: siempre a la vista. */}
        <ThemeToggle />
        <AccountMenu pathname={pathname} onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}

function Brand() {
  const { config } = useConfig();
  const logo = fileUrlFor(config?.logoUrl);
  const platformName = config?.platformName ?? 'PESV Education';

  // El nombre lo elige cada sede y puede ser largo: se recorta antes de quitarle sitio a las pestañas.
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-2.5 rounded-xl"
      aria-label={`${platformName}: ir a Hoy`}
      title={platformName}
    >
      {logo ? (
        <img src={logo} alt="" className="max-h-9 max-w-[36px] shrink-0 object-contain" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <GraduationCap className="h-5 w-5 text-primary" />
        </span>
      )}
      <span className="truncate text-[15px] font-extrabold tracking-tight text-foreground lg:max-w-[11rem] xl:max-w-[15rem]">
        {platformName}
      </span>
    </Link>
  );
}

/** Pestaña de la barra: la abierta va en píldora oscura, como en el diseño elegido. */
function TabLink({ link, active, count }: { link: MenuLink; active: boolean; count: number }) {
  return (
    <Link
      prefetch
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors xl:px-4 ${
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {link.short ?? link.label}
      <NavCount value={count} />
    </Link>
  );
}

/** «Más»: las secciones que no caben en la barra, agrupadas. */
function MoreMenu({ sections, pathname, active }: { sections: MenuSection[]; pathname: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(container, open, close);

  // Elegir una sección cierra el menú: si no, quedaría tapando la pantalla de destino.
  useEffect(close, [pathname, close]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors xl:px-4 ${
          active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        Más
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-popover p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150">
          <NavSectionList sections={sections} pathname={pathname} />
        </div>
      )}
    </div>
  );
}

/** La cuenta: quién ha entrado, con «Mi cuenta» y «Cerrar sesión». */
function AccountMenu({ pathname, onOpenSettings }: { pathname: string; onOpenSettings: () => void }) {
  const { role, user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(container, open, close);
  useEffect(close, [pathname, close]);

  const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'Usuario';

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Cuenta de ${name}`}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-muted xl:pr-3"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground"
          aria-hidden="true"
        >
          <PhotoOrInitials person={user ?? {}} drawn />
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm font-semibold xl:block">{user?.firstName || name}</span>
        <ChevronDown
          className={`hidden h-3.5 w-3.5 text-muted-foreground transition-transform xl:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_NAMES[role]}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              onOpenSettings();
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60"
          >
            <Settings className="h-4 w-4 text-muted-foreground" /> Mi cuenta
          </button>
          <div className="border-t border-border/60" />
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 dark:text-red-400"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
