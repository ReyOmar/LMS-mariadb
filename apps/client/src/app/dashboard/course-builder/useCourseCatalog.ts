'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { Course } from '@/types/models';

const CATALOG_EVENTS: readonly RealtimeEvent[] = ['course:created', 'course:updated', 'course:deleted'];

/** Cursos del catálogo del constructor; si una recarga falla se conservan los que ya se veían. */
export function useCourseCatalog() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Course[]>('/courses');
      setCourses(data);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudieron cargar los cursos.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(CATALOG_EVENTS, load);

  return { courses, error, retry: load };
}
