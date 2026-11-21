'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { Role } from '@/contexts/SessionContext';

/**
 * Los contadores del menú: las solicitudes de acceso por revisar, que sólo ve la administración,
 * y los mensajes sin leer. Un contador que no carga no debe interrumpir la navegación: los fallos
 * se ignoran y se deja el valor anterior.
 */
export function useSidebarCounters(role: Role, pathname: string) {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

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

  return { requests: pendingRequests, messages: unreadMessages };
}

export type SidebarCounters = ReturnType<typeof useSidebarCounters>;
