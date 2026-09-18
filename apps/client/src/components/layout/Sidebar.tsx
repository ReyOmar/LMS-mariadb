'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronUp, Eye, GraduationCap, LogOut, Menu, Settings, X } from 'lucide-react';
import api, { urlDeArchivo } from '@/lib/api';
import { Role, useRole } from '@/contexts/RoleContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationCenter } from '@/components/features/NotificationCenter';
import { UserSettingsModal } from '@/components/features/UserSettingsModal';
import { IndicadorDeSede } from '@/components/features/IndicadorDeSede';
import { NAVEGACION, NOMBRE_DE_ROL, type EnlaceDeMenu } from './navegacion';

/** Roles que un administrador puede previsualizar para comprobar lo que ve cada perfil. */
const ROLES_SIMULABLES: Role[] = ['teacher', 'student'];

export function Sidebar() {
  const { role, rolReal, rolSimulado, simularRol, user, cerrarSesion } = useRole();
  const { config } = useConfig();
  const ruta = usePathname() ?? '';

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [movilAbierto, setMovilAbierto] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [mensajesSinLeer, setMensajesSinLeer] = useState(0);

  const contenedorMenu = useRef<HTMLDivElement>(null);

  // ── Contadores ──

  const contarSolicitudes = useCallback(async () => {
    if (rolReal !== 'admin') return;
    try {
      const { data } = await api.get<unknown[]>('/auth/solicitudes');
      setSolicitudesPendientes(Array.isArray(data) ? data.length : 0);
    } catch {
      // Un contador que no carga no debe interrumpir la navegación.
    }
  }, [rolReal]);

  const contarMensajes = useCallback(async () => {
    try {
      const { data } = await api.get<{ no_leidos?: number }[]>('/notificaciones/mensajes/contactos');
      setMensajesSinLeer(data.reduce((total, contacto) => total + (contacto.no_leidos ?? 0), 0));
    } catch {
      /* igual que arriba */
    }
  }, []);

  useEffect(() => {
    void contarSolicitudes();
    void contarMensajes();
  }, [contarSolicitudes, contarMensajes]);

  useEventoRealtime('request:new', contarSolicitudes);
  useEventoRealtime('request:resolved', contarSolicitudes);
  useEventoRealtime('message:new', () => {
    // Si ya se está en la bandeja, el propio listado marca los mensajes como leídos.
    if (!ruta.startsWith('/dashboard/mensajes')) setMensajesSinLeer((total) => total + 1);
  });

  useEffect(() => {
    if (ruta.startsWith('/dashboard/mensajes')) setMensajesSinLeer(0);
  }, [ruta]);

  // ── Interacción ──

  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsarFuera = (evento: MouseEvent) => {
      if (!contenedorMenu.current?.contains(evento.target as Node)) setMenuAbierto(false);
    };
    document.addEventListener('mousedown', alPulsarFuera);
    return () => document.removeEventListener('mousedown', alPulsarFuera);
  }, [menuAbierto]);

  // Navegar cierra el menú móvil; si no, quedaría tapando la pantalla de destino.
  useEffect(() => setMovilAbierto(false), [ruta]);

  useEffect(() => {
    document.body.style.overflow = movilAbierto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [movilAbierto]);

  const contadores = { solicitudes: solicitudesPendientes, mensajes: mensajesSinLeer };
  const nombre = user ? `${user.nombre} ${user.apellido}`.trim() : 'Usuario';
  const iniciales = `${user?.nombre?.[0] ?? ''}${user?.apellido?.[0] ?? ''}`.toUpperCase() || '?';
  const foto = urlDeArchivo(user?.foto_url);
  const logo = urlDeArchivo(config?.logo_url);

  return (
    <>
      <button
        onClick={() => setMovilAbierto(true)}
        className="lg:hidden fixed top-3 left-3 z-[110] p-2.5 rounded-xl bg-card border border-border/50 shadow-md text-foreground hover:bg-muted transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {movilAbierto && (
        <div
          className="lg:hidden fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
          onClick={() => setMovilAbierto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar-nav w-80 border-r flex flex-col fixed h-full z-[130] transition-transform duration-300 ease-out lg:translate-x-0 ${
          movilAbierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
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
            <span className="truncate font-semibold text-foreground">
              {config?.nombre_plataforma ?? 'PESV Education'}
            </span>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <NotificationCenter />
            <button
              onClick={() => setMovilAbierto(false)}
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
          <IndicadorDeSede />
        </div>

        {rolSimulado && (
          <div className="mx-3 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
            <p className="font-bold text-amber-700 dark:text-amber-400">
              Viendo como {NOMBRE_DE_ROL[rolSimulado].toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => simularRol(null)}
              className="mt-1 font-bold text-amber-700 dark:text-amber-400 hover:underline"
            >
              Volver a mi vista
            </button>
          </div>
        )}

        {/* Navegación */}
        <nav className="py-5 px-3 flex-1 overflow-y-auto">
          {NAVEGACION[role].map((seccion) => (
            <div key={seccion.titulo} className="space-y-0.5 mb-6">
              <p className="sidebar-section-label">{seccion.titulo}</p>
              {seccion.enlaces.map((enlace) => (
                <EnlaceLateral
                  key={enlace.href + enlace.etiqueta}
                  enlace={enlace}
                  activo={esRutaActiva(ruta, enlace.href)}
                  contador={enlace.contador ? contadores[enlace.contador] : 0}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Pie con la cuenta */}
        <div className="p-3 border-t border-border/30 shrink-0 relative" ref={contenedorMenu}>
          {menuAbierto && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden z-20">
              <button
                onClick={() => {
                  setMenuAbierto(false);
                  setAjustesAbiertos(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <Settings className="h-4 w-4 text-muted-foreground" /> Mi cuenta
              </button>

              {rolReal === 'admin' && !rolSimulado && (
                <>
                  <div className="border-t border-border/50" />
                  {ROLES_SIMULABLES.map((rol) => (
                    <button
                      key={rol}
                      onClick={() => {
                        simularRol(rol);
                        setMenuAbierto(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      Ver como {NOMBRE_DE_ROL[rol].toLowerCase()}
                    </button>
                  ))}
                </>
              )}

              <div className="border-t border-border/50" />
              <button
                onClick={cerrarSesion}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setMenuAbierto((abierto) => !abierto)}
              className="flex items-center gap-3 overflow-hidden flex-1 rounded-xl px-2 py-2 hover:bg-muted/50 transition-colors"
              aria-expanded={menuAbierto}
            >
              <span className="h-9 w-9 shrink-0 rounded-xl overflow-hidden shadow-sm bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                {foto ? (
                  <img src={foto} alt="" className="h-full w-full object-cover" />
                ) : (
                  iniciales
                )}
              </span>
              <span className="truncate flex-1 text-left">
                <span className="block text-sm font-semibold leading-none truncate">{nombre}</span>
                <span className="block text-[11px] text-muted-foreground mt-1 truncate">
                  {NOMBRE_DE_ROL[role]}
                </span>
              </span>
              <ChevronUp
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${menuAbierto ? '' : 'rotate-180'}`}
              />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <UserSettingsModal open={ajustesAbiertos} onClose={() => setAjustesAbiertos(false)} />
    </>
  );
}

/** El panel raíz sólo está activo en coincidencia exacta; el resto, por prefijo. */
function esRutaActiva(ruta: string, href: string): boolean {
  return href === '/dashboard' ? ruta === '/dashboard' : ruta.startsWith(href);
}

function EnlaceLateral({
  enlace,
  activo,
  contador,
}: {
  enlace: EnlaceDeMenu;
  activo: boolean;
  contador: number;
}) {
  const Icono = enlace.icono;

  return (
    <Link
      prefetch
      href={enlace.href}
      className={`sidebar-link ${activo ? 'sidebar-link-active' : ''}`}
      aria-current={activo ? 'page' : undefined}
    >
      <Icono className="h-4 w-4 shrink-0" />
      <span className="truncate">{enlace.etiqueta}</span>
      {contador > 0 && (
        <span className="ml-auto bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {contador > 99 ? '99+' : contador}
        </span>
      )}
    </Link>
  );
}
