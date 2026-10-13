'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAlerts } from '@/contexts/AlertContext';

/**
 * Curso abierto de una pantalla con directorio de cursos. Si deja de estar entre los del
 * examinador (se lo desasignaron o se borró), se vuelve al directorio avisando.
 */
export function useChosenCourse<T extends { courseGuid: string }>(courses: T[] | null) {
  const { notify } = useAlerts();
  const [courseGuid, setCourseGuid] = useState<string | null>(null);

  const course = courseGuid ? courses?.find((candidate) => candidate.courseGuid === courseGuid) : undefined;
  const vanished = Boolean(courses && courseGuid && !course);
  const close = useCallback(() => setCourseGuid(null), []);

  useEffect(() => {
    if (!vanished) return;
    notify.info('El curso ya no está disponible');
    close();
  }, [vanished, notify, close]);

  return { course, open: setCourseGuid, close };
}
