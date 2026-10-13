'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useCurrentList } from '@/hooks/useCurrentList';

/**
 * Cifras de cabecera de una pantalla, contadas por el servidor sobre todo su alcance. Si una
 * recarga falla se conservan las anteriores; `error` sólo pesa mientras no haya ninguna.
 *
 * @param params Objeto estable (memorizado): cambiarlo vuelve a pedir las cifras.
 */
export function useSummary<T>(endpoint: string, params?: object) {
  const requests = useCurrentList();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const isCurrent = requests.start();
    try {
      const { data: fresh } = await api.get<T>(endpoint, { params });
      if (!isCurrent()) return;
      setData(fresh);
      setError(null);
    } catch (failure) {
      if (isCurrent()) setError(errorMessage(failure));
    }
  }, [endpoint, params, requests]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}
