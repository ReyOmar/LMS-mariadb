'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { Certificate, Course, StudentMetrics } from '@/types/models';

/** El certificado más reciente: el «último logro» del tablero. */
function latestOf(certificates: Certificate[]): Certificate | null {
  return certificates.reduce<Certificate | null>(
    (latest, certificate) => (!latest || certificate.completedAt > latest.completedAt ? certificate : latest),
    null,
  );
}

/** Los cursos, las cifras y el último certificado del alumno, al día con lo que le afecta. */
export function useStudentDashboard() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [metrics, setMetrics] = useState<StudentMetrics | null>(null);
  const [latestCertificate, setLatestCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      // Cada curso trae ya su avance: no hace falta pedirlo curso a curso.
      const [coursesRes, metricsRes, certificatesRes] = await Promise.all([
        api.get<Course[]>('/courses'),
        api.get<StudentMetrics>('/students/metrics'),
        // El último logro es un detalle: si no carga, el resto del tablero sigue.
        api.get<Certificate[]>('/certificates').catch(() => ({ data: [] as Certificate[] })),
      ]);
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : []);
      setMetrics(metricsRes.data);
      setLatestCertificate(latestOf(Array.isArray(certificatesRes.data) ? certificatesRes.data : []));
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

  return { user, courses, metrics, latestCertificate, loading };
}
