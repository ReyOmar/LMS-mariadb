'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import type { Course } from '@/types/models';

/** El curso del recurso, con su estado y su temario, tal como lo ve quien lo gestiona. */
export function useEditorCourse(courseGuid: string) {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<Course>(`/courses/${courseGuid}/manage`);
      setCourse(data);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo abrir el recurso.'));
    }
  }, [courseGuid]);

  useEffect(() => {
    void load();
  }, [load]);

  return { course, error, retry: load };
}
