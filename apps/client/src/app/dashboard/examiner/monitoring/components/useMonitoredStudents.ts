'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { MonitoredStudent } from '@/types/models';
import { useRoundClosed } from '../../hooks/useRoundClosed';
import { withoutClosedRound } from './closed-round';

export const MONITORING_EVENTS: readonly RealtimeEvent[] = [
  'submission:new',
  'submission:graded',
  'enrollment:changed',
  'round:closed',
];

export interface MonitoringFilter {
  course?: string;
  search?: string;
}

interface PagedStudents {
  cursor: string | null;
  students: MonitoredStudent[];
}

/**
 * Alumnos monitorizados por páginas.
 * @param filter Objeto estable (memorizado): cambiarlo vuelve a empezar la lista.
 */
export function useMonitoredStudents(filter: MonitoringFilter) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<PagedStudents>('/dashboards/monitoring', { params: { ...filter, cursor } });
      return { items: data.students, cursor: data.cursor };
    },
    [filter],
  );

  const students = usePagedList<MonitoredStudent>(fetchPage, 'No se pudieron cargar los estudiantes.');
  const { refresh, updateItems } = students;

  useLiveRefresh(MONITORING_EVENTS, refresh);
  useRoundClosed((round) => updateItems((rows) => withoutClosedRound(rows, round)));

  return students;
}
