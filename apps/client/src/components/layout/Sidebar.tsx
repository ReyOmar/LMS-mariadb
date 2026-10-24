'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronUp, GraduationCap, LogOut, Menu, Settings, X } from 'lucide-react';
import api, { fileUrlFor } from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PhotoOrInitials } from '@/components/ui/UserAvatar';
import { NotificationCenter } from '@/components/features/NotificationCenter';
import { AccountSettings } from '@/components/features/AccountSettings';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { useDialog } from '@/hooks/useDialog';
import { NAVIGATION, ROLE_NAMES, type MenuLink } from './navigation';

export function Sidebar() {
  const { role, user, logout } = useSession();
  const { config } = useConfig();
  const pathname = usePathname() ?? '';

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const menuContainer = useRef<HTMLDivElement>(null);

  // ── Contadores ──

  // Un contador que no carga no debe interrumpir la navegación: los fallos se ignoran.
  const countRequests = useCallback(async () => {
    if (role !== 'admin') return;
    try {
      // Basta el recuento; la lista completa de solicitudes no hace falta para un número.
      const { data } = await api.get<{ count: number }>('/auth/access-requests/pending-count');
      setPendingRequests(data.count);
    } catch {
      // Se deja el valor anterior.
    }
  }, [role]);

  const countMessages = useCallback(async () => {
    try {
      const { data } = await api.get<{ unreadCount?: number }[]>('/notifications/messages/contacts');
      setUnreadMessages(data.reduce((total, contact) => total + (contact.unreadCount ?? 0), 0));
    } catch {
      // Se deja el valor anterior.
    }
  }, []);

  useEffect(() => {
    void countRequests();
  }, [countRequests]);

  // Se cuenta al cargar y al entrar o salir de la bandeja, por si se perdió algún aviso.
  const inInbox = pathname.startsWith('/dashboard/messages');
  useEffect(() => {
    void countMessages();
  }, [inInbox, countMessages]);

  useRealtimeEvent('request:new', countRequests);
  useRealtimeEvent('request:resolved', countRequests);
  // Cada mensaje nuevo suma uno; al leer una conversación —en esta pestaña o en otra— el
  // servidor lo anuncia y se vuelve a contar.
  useRealtimeEvent('message:new', () => setUnreadMessages((total) => total + 1));
  useRealtimeEvent('message:read', countMessages);

  // ── Interacción ──

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!menuContainer.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  // Navegar cierra el menú móvil; si no, quedaría tapando la pantalla de destino.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Abierto en el móvil, el menú es una ventana modal sobre la página.
  const mobileMenu = useDialog<HTMLElement>({
    open: mobileOpen,
    onClose: () => setMobileOpen(false),
    label: 'Menú principal',
  });

  const counters = { requests: pendingRequests, messages: unreadMessages };
  // En el móvil la campana y los contadores quedan dentro del menú cerrado: el botón lo señala.
  const somethingNew = unreadNotifications + unreadMessages + pendingRequests > 0;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'Usuario';
  const logo = fileUrlFor(config?.logoUrl);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-[110] p-2.5 rounded-xl bg-card border border-border/50 shadow-md text-foreground hover:bg-muted transition-colors"
        aria-label={somethingNew ? 'Abrir menú (hay novedades)' : 'Abrir menú'}
      >
        <Menu className="h-5 w-5" />
        {somethingNew && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-background" />
        )}
      </button>

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
            <span className="truncate font-semibold text-foreground">{config?.platformName ?? 'PESV Education'}</span>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <NotificationCenter onUnreadChange={setUnreadNotifications} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
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

        {/* Navegación */}
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

        {/* Pie con la cuenta */}
        <div className="p-3 border-t border-border/30 shrink-0 relative" ref={menuContainer}>
          {menuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden z-20">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <Settings className="h-4 w-4 text-muted-foreground" /> Mi cuenta
              </button>

              <div className="border-t border-border/50" />
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-3 overflow-hidden flex-1 rounded-xl px-2 py-2 hover:bg-muted/50 transition-colors"
              aria-expanded={menuOpen}
            >
              <span className="h-9 w-9 shrink-0 rounded-xl overflow-hidden shadow-sm bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                <PhotoOrInitials person={user ?? {}} />
              </span>
              <span className="truncate flex-1 text-left">
                <span className="block text-sm font-semibold leading-none truncate">{name}</span>
                <span className="block text-[11px] text-muted-foreground mt-1 truncate">{ROLE_NAMES[role]}</span>
              </span>
              <ChevronUp
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${menuOpen ? '' : 'rotate-180'}`}
              />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
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
