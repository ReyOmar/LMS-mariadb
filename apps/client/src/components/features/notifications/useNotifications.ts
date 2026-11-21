'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { Notification } from '@/types/models';

/** Cuántos avisos se piden y se conservan en el panel. */
const MAX_NOTIFICATIONS = 25;

/**
 * Los avisos de la persona y cuántos le quedan por leer, al día con lo que llega en tiempo real.
 * `onUnreadChange` recibe el recuento para señalarlo donde la campana no se ve.
 */
export function useNotifications(onUnreadChange: (unread: number) => void) {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

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

  /** Borra todos los avisos. Si falla, lanza el error para que se explique. */
  const clearAll = async () => {
    await api.delete('/notifications');
    setNotifications([]);
    setUnread(0);
  };

  return { notifications, unread, loading, markAllRead, clearAll };
}
