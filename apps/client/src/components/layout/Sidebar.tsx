'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronUp, GraduationCap, LogOut, Menu, Settings, X } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { useSession, type Role } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PhotoOrInitials } from '@/components/ui/UserAvatar';
import { NotificationCenter } from '@/components/features/NotificationCenter';
import { AccountSettings } from '@/components/features/AccountSettings';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { useDialog } from '@/hooks/useDialog';
import { NAVIGATION, ROLE_NAMES, type MenuLink } from './navigation';
import { useSidebarCounters, type SidebarCounters } from './useSidebarCounters';

export function Sidebar() {
  const { role, user, logout } = useSession();
  const { config } = useConfig();
  const pathname = usePathname() ?? '';

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const counters = useSidebarCounters(role, pathname);

  // Navegar cierra el menú móvil; si no, quedaría tapando la pantalla de destino.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Abierto en el móvil, el menú es una ventana modal sobre la página.
  const mobileMenu = useDialog<HTMLElement>({
    open: mobileOpen,
    onClose: () => setMobileOpen(false),
    label: 'Menú principal',
  });

  // En el móvil la campana y los contadores quedan dentro del menú cerrado: el botón lo señala.
  const somethingNew = unreadNotifications + counters.messages + counters.requests > 0;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'Usuario';
  const logo = fileUrlFor(config?.logoUrl);
  const platformName = config?.platformName ?? 'PESV Education';

  return (
    <>
      <MobileTopBar
        logo={logo}
        platformName={platformName}
        somethingNew={somethingNew}
        onOpen={() => setMobileOpen(true)}
      />

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          data-keep-active
        />
      )}

      <aside
        {...mobileMenu.dialogProps}
        className={`sidebar-nav w-80 border-r flex flex-col fixed h-full z-[130] transition-transform duration-300 ease-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Cabecera */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border/30 shrink-0 gap-2">
          <div className="flex items-center gap-2.5 font-bold text-base text-primary overflow-hidden flex-1">
            {logo ? (
              <img src={logo} alt="" className="max-h-10 max-w-[36px] object-contain shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <GraduationCap className="h-4.5 w-4.5 text-primary" />
              </div>
            )}
            <span className="truncate font-semibold text-foreground">{platformName}</span>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <NotificationCenter onUnreadChange={setUnreadNotifications} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden tap-target inline-flex items-center justify-center p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Sede activa: con dos operaciones separadas, saber en cuál se está evita pensar
            que faltan cursos cuando en realidad se está mirando la otra. */}
        <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">Sede</span>
          <CountryIndicator readOnly />
        </div>

        <SidebarNav role={role} pathname={pathname} counters={counters} />

        <AccountMenu
          name={name}
          roleName={ROLE_NAMES[role]}
          person={user ?? {}}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={logout}
        />
      </aside>

      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

/**
 * En el móvil, una barra con fondo: el contenido pasa por debajo de ella al desplazarse, en lugar
 * de quedar tapado por un botón suelto.
 */
function MobileTopBar({
  logo,
  platformName,
  somethingNew,
  onOpen,
}: {
  logo: string | null | undefined;
  platformName: string;
  somethingNew: boolean;
  onOpen: () => void;
}) {
  return (
    <header className="lg:hidden fixed inset-x-0 top-0 z-[110] border-b border-border/50 bg-card/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      <div className="h-14 flex items-center gap-2 px-2">
        <button
          type="button"
          onClick={onOpen}
          className="relative h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl text-foreground hover:bg-muted transition-colors"
          aria-label={somethingNew ? 'Abrir menú (hay novedades)' : 'Abrir menú'}
        >
          <Menu className="h-5 w-5" />
          {somethingNew && (
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-card" />
          )}
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {logo ? (
            <img src={logo} alt="" className="max-h-8 max-w-[32px] object-contain shrink-0" />
          ) : (
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="h-4 w-4 text-primary" />
            </span>
          )}
          <span className="truncate text-sm font-semibold text-foreground">{platformName}</span>
        </div>
      </div>
    </header>
  );
}

function SidebarNav({ role, pathname, counters }: { role: Role; pathname: string; counters: SidebarCounters }) {
  return (
    <nav className="py-5 px-3 flex-1 overflow-y-auto">
      {NAVIGATION[role].map((section) => (
        <div key={section.title} className="space-y-0.5 mb-6">
          <p className="sidebar-section-label">{section.title}</p>
          {section.links.map((link) => (
            <SidebarLink
              key={link.href + link.label}
              link={link}
              active={isActiveRoute(pathname, link.href)}
              counter={link.counter ? counters[link.counter] : 0}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** El pie del menú: quién ha entrado, con «Mi cuenta» y «Cerrar sesión» en un menú desplegable. */
function AccountMenu({
  name,
  roleName,
  person,
  onOpenSettings,
  onLogout,
}: {
  name: string;
  roleName: string;
  person: Parameters<typeof PhotoOrInitials>[0]['person'];
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="p-3 border-t border-border/30 shrink-0 relative" ref={container}>
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden z-20">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" /> Mi cuenta
          </button>

          <div className="border-t border-border/50" />
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive dark:text-red-400 hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex items-center gap-3 overflow-hidden flex-1 rounded-xl px-2 py-2 hover:bg-muted/50 transition-colors"
          aria-expanded={open}
        >
          <span className="h-9 w-9 shrink-0 rounded-xl overflow-hidden shadow-sm bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
            <PhotoOrInitials person={person} />
          </span>
          <span className="truncate flex-1 text-left">
            <span className="block text-sm font-semibold leading-none truncate">{name}</span>
            <span className="block text-[11px] text-muted-foreground mt-1 truncate">{roleName}</span>
          </span>
          <ChevronUp
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? '' : 'rotate-180'}`}
          />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

/** El panel raíz sólo está activo en coincidencia exacta; el resto, por prefijo. */
function isActiveRoute(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
}

function SidebarLink({ link, active, counter }: { link: MenuLink; active: boolean; counter: number }) {
  const Icon = link.icon;

  return (
    <Link
      prefetch
      href={link.href}
      className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{link.label}</span>
      {counter > 0 && (
        <span className="ml-auto bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {counter > 99 ? '99+' : counter}
        </span>
      )}
    </Link>
  );
}
