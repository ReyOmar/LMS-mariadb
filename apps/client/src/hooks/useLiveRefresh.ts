'use client';

import { useEffect, useRef } from 'react';
import { useRealtime, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { RealtimeEvent } from '@/lib/realtime/events';

/**
 * Refresca la pantalla con cada aviso de `events` y al recuperarse el flujo tras un corte,
 * porque los avisos de ese intervalo se perdieron.
 *
 * @param events Lista estable (una constante del módulo): cambiarla vuelve a suscribir.
 * @param refresh Se encarga de sus propios errores.
 */
export function useLiveRefresh(events: readonly RealtimeEvent[], refresh: () => Promise<void> | void): void {
  const { subscribe } = useRealtime();
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    const unsubscribers = events.map((event) => subscribe(event, () => void latest.current()));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [events, subscribe]);

  useRealtimeReconnect(() => void latest.current());
}
