'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useCurrentList } from '@/hooks/useCurrentList';
import { useInFlight } from '@/hooks/useInFlight';
import type { AssignableCourse, CourseHolder } from './assignment';

/** Cursos de la sede, al día con lo que otros administradores crean, asignan o borran, y su responsable. */
export function useCourseDirectory() {
  const { notify } = useAlerts();
  const list = useCurrentList();
  const [courses, setCourses] = useState<AssignableCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changing = useInFlight<string>();

  const load = useCallback(async () => {
    const isCurrent = list.start();
    setError(null);
    try {
      const { data } = await api.get<AssignableCourse[]>('/courses');
      if (!isCurrent()) return;
      setCourses(Array.isArray(data) ? data : []);
    } catch (failure) {
      if (isCurrent()) setError(errorMessage(failure, 'No se pudieron cargar los cursos.'));
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvent('course:created', () => void load());
  useRealtimeEvent('course:updated', () => void load());
  useRealtimeEvent('course:deleted', () => void load());
  useRealtimeReconnect(() => void load());

  /** Pone el curso a cargo de otra persona; un segundo clic mientras tanto no lanza otra petición. */
  const changeHolder = (courseGuid: string, holder: CourseHolder, successMessage: string) =>
    changing.run(courseGuid, async () => {
      try {
        await api.post(`/courses/${encodeURIComponent(courseGuid)}/assign`, { teacherGuid: holder.guid });
        setCourses(
          (current) =>
            current?.map((course) =>
              course.guid === courseGuid ? { ...course, teacherGuid: holder.guid, teacher: holder } : course,
            ) ?? null,
        );
        notify.success(successMessage);
      } catch (failure) {
        notify.error('No se pudo cambiar el responsable', errorMessage(failure));
      }
    });

  return { courses, error, retry: load, changeHolder, isChangingHolder: changing.has };
}
