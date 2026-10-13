'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { MonitoredStudent } from '@/types/models';

export const MONITORING_EVENTS: readonly RealtimeEvent[] = [
  'submission:new',
  'submission:graded',
  'enrollment:changed',
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
  useLiveRefresh(MONITORING_EVENTS, students.refresh);
  return students;
}
