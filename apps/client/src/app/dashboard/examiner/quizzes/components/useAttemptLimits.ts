'use client';

import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { Course } from '@/types/models';
import { attemptLimits } from './results';

const UNKNOWN_LIMITS: ReadonlyMap<string, number> = new Map();

/** Intentos permitidos de cada cuestionario del curso, para saber a quién se le agotaron. */
export function useAttemptLimits(courseGuid: string): ReadonlyMap<string, number> {
  const { notify } = useAlerts();
  const [limits, setLimits] = useState(UNKNOWN_LIMITS);

  useEffect(() => {
    let current = true;
    api
      .get<Course>(`/courses/${courseGuid}/manage`)
      .then(({ data }) => {
        if (current) setLimits(attemptLimits(data));
      })
      .catch((error) => {
        if (current) notify.error('No se pudieron leer los intentos permitidos', errorMessage(error));
      });
    return () => {
      current = false;
    };
  }, [courseGuid, notify]);

  return limits;
}
