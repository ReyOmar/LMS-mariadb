'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { CountrySummary } from '@/types/models';

/** Las cifras de la sede, al día con las altas, las solicitudes y los cambios de cursos. */
export function useAdminDashboard() {
  const [stats, setStats] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useAlerts();

  const loadDashboardData = useCallback(async () => {
    const summary = await api
      .get<CountrySummary>('/dashboards/admin')
      .then((response) => response.data)
      .catch((error: unknown) => {
        notify.error('No se pudo cargar el panel de la sede', errorMessage(error));
        return null;
      });

    setStats(summary);
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useRealtimeEvent('request:new', loadDashboardData);
  useRealtimeEvent('request:resolved', loadDashboardData);
  useRealtimeEvent('enrollment:changed', loadDashboardData);
  useRealtimeEvent('course:created', loadDashboardData);
  useRealtimeEvent('course:updated', loadDashboardData);
  useRealtimeEvent('course:deleted', loadDashboardData);
  useRealtimeEvent('course:maintenance', loadDashboardData);
  useRealtimeEvent('user:created', loadDashboardData);
  useRealtimeEvent('user:deleted', loadDashboardData);
  useRealtimeReconnect(loadDashboardData);

  return { stats, loading };
}
