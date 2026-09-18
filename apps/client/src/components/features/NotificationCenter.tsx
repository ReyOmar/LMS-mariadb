"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, X, MessageSquare, Star, AlertTriangle, BookOpen, RefreshCw, Clock, Inbox, ChevronRight, Trash2 } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import api from '@/lib/api';

interface Notification {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  url_accion?: string;
  created_at: string;
}

const iconMap: Record<string, any> = {
  TAREA_CALIFICADA: Star,
  ENTREGA_RECHAZADA: AlertTriangle,
  MODULO_REINICIADO: RefreshCw,
  REVISION_ENTREGA: Clock,
  MENSAJE_NUEVO: MessageSquare,
  CURSO_REACTIVADO: BookOpen,
  RECORDATORIO_INACTIVIDAD: Bell,
  EVALUACION_NUEVA: Star,
  ANUNCIO_CURSO: BookOpen,
  ANUNCIO_GLOBAL: Bell,
};

const colorMap: Record<string, string> = {
  TAREA_CALIFICADA: 'text-emerald-500 bg-emerald-500/10',
  ENTREGA_RECHAZADA: 'text-red-500 bg-red-500/10',
  MODULO_REINICIADO: 'text-amber-500 bg-amber-500/10',
  REVISION_ENTREGA: 'text-blue-500 bg-blue-500/10',
  MENSAJE_NUEVO: 'text-primary bg-primary/10',
  CURSO_REACTIVADO: 'text-emerald-500 bg-emerald-500/10',
  RECORDATORIO_INACTIVIDAD: 'text-amber-500 bg-amber-500/10',
};

export function NotificationCenter() {
  const { user } = useRole();
  const [notificaciones, setNotificaciones] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotificaciones = useCallback(async () => {
    if (!user?.guid) return;
    setLoading(true);
    try {
      const [notifsRes, countRes] = await Promise.all([
        api.get('/notificaciones?limit=25'),
        api.get('/notificaciones/no-leidas'),
      ]);
      setNotificaciones(notifsRes.data || []);
      setUnreadCount(countRes.data?.total || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.guid]);

  useEffect(() => {
    fetchNotificaciones();
  }, [fetchNotificaciones]);

  // Un aviso nuevo se añade en el momento, sin volver a pedir la lista entera.
  useEventoRealtime('notification:new', (data) => {
    setNotificaciones((prev) => [data as Notification, ...prev].slice(0, 25));
    setUnreadCount((prev) => prev + 1);
  });

  // Auto-mark all notifications as read when the panel opens
  useEffect(() => {
    if (open && unreadCount > 0) {
      // Mark all as read on the server
      api.patch('/notificaciones/leer-todas').then(() => {
        setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
        setUnreadCount(0);
      }).catch(() => {});
    }
    // Cleanup auto-close timer when panel state changes
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const clearAll = async () => {
    try {
      await api.delete('/notificaciones');
      setNotificaciones([]);
      setUnreadCount(0);
      // Auto-close the panel after 500ms
      autoCloseTimerRef.current = setTimeout(() => {
        setOpen(false);
      }, 500);
    } catch {}
  };

  const handleNotifClick = (notif: Notification) => {
    if (notif.url_accion) {
      window.location.href = notif.url_accion;
      setOpen(false);
    }
  };

  const getIcon = (tipo: string) => {
    const Icon = iconMap[tipo] || Bell;
    return Icon;
  };

  const getColorClass = (tipo: string) => {
    return colorMap[tipo] || 'text-muted-foreground bg-muted';
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl bg-card border border-border hover:bg-muted transition-all shadow-sm group"
        aria-label="Notificaciones"
      >
        <Bell className={`h-5 w-5 transition-colors ${open ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {open && (
        <div className="fixed inset-x-0 top-0 bottom-0 sm:absolute sm:inset-auto sm:left-0 sm:top-14 sm:w-[380px] sm:max-h-[520px] sm:rounded-2xl bg-card border border-border sm:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] z-[99999] overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-card to-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">Notificaciones</h3>
              {unreadCount > 0 && (
                <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} nueva{unreadCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notificaciones.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                  title="Limpiar todas las notificaciones"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[440px]">
            {loading && notificaciones.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Cargando...
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Sin notificaciones</p>
                <p className="text-xs mt-1 opacity-70">Aquí aparecerán tus alertas y mensajes.</p>
              </div>
            ) : (
              notificaciones.map((n) => {
                const Icon = getIcon(n.tipo);
                const colorClass = getColorClass(n.tipo);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`px-4 py-3.5 border-b border-border/40 cursor-pointer hover:bg-muted/40 transition-all group/item ${
                      !n.leida ? 'bg-primary/[0.03]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.leida && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" />}
                          <p className={`text-sm truncate ${!n.leida ? 'font-bold' : 'font-medium'}`}>{n.titulo}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.mensaje}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">{timeAgo(n.created_at)}</p>
                      </div>
                      {n.url_accion && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/item:text-muted-foreground shrink-0 mt-1 transition-colors" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
