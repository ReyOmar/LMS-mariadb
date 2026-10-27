'use client';

import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Bell,
  X,
  MessageSquare,
  Star,
  AlertTriangle,
  BookOpen,
  RefreshCw,
  Clock,
  Inbox,
  ChevronRight,
  Trash2,
  Award,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useDialog } from '@/hooks/useDialog';
import api, { errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import { plural } from '@/lib/text';
import type { Notification, NotificationType } from '@/types/models';

/** Cuántos avisos se piden y se conservan en el panel. */
const MAX_NOTIFICATIONS = 25;

const ICON_BY_TYPE: Partial<Record<NotificationType, LucideIcon>> = {
  ASSIGNMENT_GRADED: Star,
  SUBMISSION_REJECTED: AlertTriangle,
  MODULE_RESET: RefreshCw,
  SUBMISSION_REVIEW: Clock,
  NEW_MESSAGE: MessageSquare,
  COURSE_REACTIVATED: BookOpen,
  INACTIVITY_REMINDER: Bell,
  NEW_ASSESSMENT: Star,
  COURSE_ANNOUNCEMENT: BookOpen,
  GLOBAL_ANNOUNCEMENT: Bell,
  BADGE_UNLOCKED: Award,
  ENROLLMENT_WAITING: Clock,
};

const COLOR_BY_TYPE: Partial<Record<NotificationType, string>> = {
  ASSIGNMENT_GRADED: 'text-emerald-500 bg-emerald-500/10',
  SUBMISSION_REJECTED: 'text-red-500 bg-red-500/10',
  MODULE_RESET: 'text-amber-500 bg-amber-500/10',
  SUBMISSION_REVIEW: 'text-blue-500 bg-blue-500/10',
  NEW_MESSAGE: 'text-primary bg-primary/10',
  COURSE_REACTIVATED: 'text-emerald-500 bg-emerald-500/10',
  INACTIVITY_REMINDER: 'text-amber-500 bg-amber-500/10',
  BADGE_UNLOCKED: 'text-emerald-500 bg-emerald-500/10',
  ENROLLMENT_WAITING: 'text-amber-500 bg-amber-500/10',
};

/** `onUnreadChange` avisa del recuento para señalarlo donde la campana no se ve, como el menú del móvil. */
export function NotificationCenter({ onUnreadChange }: { onUnreadChange: (unread: number) => void }) {
  const { user } = useSession();
  const { notify } = useAlerts();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  /**
   * Avisos que estaban sin leer al abrir el panel. Abrirlo los marca leídos, pero siguen
   * resaltados hasta cerrarlo: si no, el resaltado desaparecería antes de poder verlo.
   */
  const [highlighted, setHighlighted] = useState<ReadonlySet<number>>(() => new Set());
  // Dónde está la campana al abrir: en pantallas anchas el panel se despliega bajo ella.
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const panelContainer = useRef<HTMLDivElement>(null);
  const { dialogProps, titleId } = useDialog({ open, onClose: () => setOpen(false) });
  const panel = dialogProps.ref;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.guid) return;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        api.get<Notification[]>('/notifications', { params: { limit: MAX_NOTIFICATIONS } }),
        api.get<{ total: number }>('/notifications/unread'),
      ]);
      setNotifications(list.data ?? []);
      setUnread(count.data?.total ?? 0);
    } catch {
      // Los avisos son complementarios: si no cargan, la pantalla sigue siendo usable.
      // Llegarán en el siguiente evento de tiempo real o al volver a abrir el panel.
    } finally {
      setLoading(false);
    }
  }, [user?.guid]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => onUnreadChange(unread), [unread, onUnreadChange]);

  // Un aviso nuevo se añade en el momento, sin volver a pedir la lista entera.
  useRealtimeEvent('notification:new', (data) => {
    setNotifications((prev) => [data as Notification, ...prev].slice(0, MAX_NOTIFICATIONS));
    setUnread((prev) => prev + 1);
  });

  // Leer una conversación marca como leídos los avisos de sus mensajes.
  useRealtimeEvent('message:read', () => void loadNotifications());

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelContainer.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, panel]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  /** Abrir el panel equivale a leer los avisos: se marcan todos de una vez. */
  const markAllRead = () => {
    api
      .patch('/notifications/read-all')
      .then(() => {
        setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
        setUnread(0);
      })
      .catch(() => undefined);
  };

  const togglePanel = () => {
    // El cierre retrasado de «Limpiar» no puede cerrar el panel que se vuelve a abrir.
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const opening = !open;
    const bell = panelContainer.current?.getBoundingClientRect();
    if (opening && bell) setAnchor({ top: bell.top, left: bell.left });
    if (opening) setHighlighted(new Set(notifications.filter((item) => !item.read).map((item) => item.id)));
    setOpen(opening);
    if (opening && unread > 0) markAllRead();
  };

  const clearAll = async () => {
    try {
      await api.delete('/notifications');
      setNotifications([]);
      setUnread(0);
      // El panel se cierra medio segundo después: da tiempo a ver qué se pulsó.
      closeTimer.current = setTimeout(() => setOpen(false), 500);
    } catch (error) {
      notify.error('No se pudieron borrar las notificaciones', errorMessage(error));
    }
  };

  const isNew = (notification: Notification) => !notification.read || highlighted.has(notification.id);
  // Con más avisos sin leer de los que caben en el panel, manda el recuento del servidor.
  const newCount = Math.max(unread, notifications.filter(isNew).length);

  const openNotification = (notification: Notification) => {
    if (!notification.actionUrl) return;
    setOpen(false);
    // Las direcciones del propio campus se abren sin recargar la aplicación.
    if (notification.actionUrl.startsWith('/')) router.push(notification.actionUrl);
    else window.location.href = notification.actionUrl;
  };

  return (
    <div className="relative" ref={panelContainer}>
      {/* Botón de la campana */}
      <button
        type="button"
        onClick={togglePanel}
        className="relative p-2.5 rounded-xl bg-card border border-border hover:bg-muted transition-all shadow-sm group"
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
      >
        <Bell
          className={`h-5 w-5 transition-colors ${open ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
        />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background animate-in zoom-in-50 duration-200">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panel de avisos. Va directamente en el `body`: dentro del menú lateral, que se desplaza
          con `transform`, el `fixed` quedaría encerrado en él y no cubriría la pantalla del móvil. */}
      {open &&
        createPortal(
          <div
            {...dialogProps}
            style={{ '--panel-top': `${anchor.top}px`, '--panel-left': `${anchor.left}px` } as CSSProperties}
            className="fixed inset-x-0 top-0 bottom-0 sm:inset-auto sm:top-[calc(var(--panel-top)_+_3.5rem)] sm:left-[var(--panel-left)] sm:w-[380px] sm:max-h-[520px] sm:rounded-2xl bg-card border border-border sm:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] z-[99999] overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 flex flex-col"
          >
            {/* Cabecera */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-card to-muted/30">
              <div className="flex items-center gap-2">
                <h3 id={titleId} className="font-bold text-sm">
                  Notificaciones
                </h3>
                {newCount > 0 && (
                  <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {newCount} {plural(newCount, 'nueva', 'nuevas')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-500"
                    title="Limpiar todas las notificaciones"
                    aria-label="Limpiar todas las notificaciones"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  aria-label="Cerrar notificaciones"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="overflow-y-auto max-h-[440px]">
              {loading && notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Cargando...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Sin notificaciones</p>
                  <p className="text-xs mt-1 opacity-70">Aquí aparecerán tus alertas y mensajes.</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    isNew={isNew(notification)}
                    onOpen={() => openNotification(notification)}
                  />
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function NotificationItem({
  notification,
  isNew,
  onOpen,
}: {
  notification: Notification;
  isNew: boolean;
  onOpen: () => void;
}) {
  const Icon = ICON_BY_TYPE[notification.type] ?? Bell;
  const colorClass = COLOR_BY_TYPE[notification.type] ?? 'text-muted-foreground bg-muted';

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!notification.actionUrl}
      className={`block w-full text-left px-4 py-3.5 border-b border-border/40 cursor-pointer hover:bg-muted/40 transition-all group/item disabled:cursor-default ${
        isNew ? 'bg-primary/[0.03]' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isNew && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" />}
            <p className={`text-sm truncate ${isNew ? 'font-bold' : 'font-medium'}`}>{notification.title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{notification.message}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">{timeAgo(notification.createdAt)}</p>
        </div>
        {notification.actionUrl && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover/item:text-muted-foreground shrink-0 mt-1 transition-colors" />
        )}
      </div>
    </button>
  );
}
