'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';
import type { RealtimeEvent } from '@/lib/realtime/events';
import { useCurrentList } from './useCurrentList';
import { useLiveRefresh } from './useLiveRefresh';

/**
 * Datos de una pantalla al día con cada aviso de `events`, sin que una respuesta atrasada pise a otra más
 * reciente. Sólo un fallo de la primera carga llega a `error`; si falla un refresco, se conserva lo que se ve.
 *
 * @param fetch Memorizada: cambiarla vuelve a pedir los datos.
 * @param events Lista estable (una constante del módulo).
 */
export function useLiveData<T>(fetch: () => Promise<T>, failureMessage: string, events: readonly RealtimeEvent[]) {
  const requests = useCurrentList();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    const isCurrent = requests.start();
    try {
      const fresh = await fetch();
      if (!isCurrent()) return;
      loaded.current = true;
      setData(fresh);
      setError(null);
    } catch (failure) {
      if (isCurrent() && !loaded.current) setError(errorMessage(failure, failureMessage));
    }
  }, [fetch, failureMessage, requests]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLiveRefresh(events, refresh);

  /** Cambia lo que se ve sin volver a pedirlo, tras una acción que ya confirmó el servidor. */
  const update = useCallback((change: (current: T) => T) => {
    setData((current) => (current === null ? current : change(current)));
  }, []);

  return {
    data,
    loading: data === null && error === null,
    error,
    retry: () => {
      setError(null);
      void refresh();
    },
    refresh,
    update,
  };
}
