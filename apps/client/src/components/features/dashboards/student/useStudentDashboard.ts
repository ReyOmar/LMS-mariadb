'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { Course, StudentMetrics } from '@/types/models';

/** Los cursos y las cifras del alumno, al día con lo que le afecta. */
export function useStudentDashboard() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [metrics, setMetrics] = useState<StudentMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      // Cada curso trae ya su avance: no hace falta pedirlo curso a curso.
      const [coursesRes, metricsRes] = await Promise.all([
        api.get<Course[]>('/courses'),
        api.get<StudentMetrics>('/students/metrics'),
      ]);
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : []);
      setMetrics(metricsRes.data);
    } catch (error) {
      notify.error('No se pudo cargar tu tablero', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user?.guid) void loadData();
  }, [user?.guid, loadData]);

  // El tablero se refresca cuando cambia algo que le afecta directamente.
  useRealtimeEvent('submission:graded', loadData);
  useRealtimeEvent('enrollment:changed', loadData);
  useRealtimeEvent('course:updated', loadData);
  useRealtimeEvent('course:deleted', loadData);
  useRealtimeEvent('course:maintenance', loadData);
  useRealtimeEvent('certificate:new', loadData);
  useRealtimeReconnect(loadData);

  return { user, courses, metrics, loading };
}
