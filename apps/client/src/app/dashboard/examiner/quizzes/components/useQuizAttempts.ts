'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { ExaminerSubmission } from '../../types';
import { attemptsByStudent, type AttemptFilter, type StudentAttempts } from './results';

const LIST_EVENTS: readonly RealtimeEvent[] = ['submission:graded', 'submission:files-retired'];

interface AttemptsResponse {
  cursor: string | null;
  submissions: ExaminerSubmission[];
}

/** Intentos de un curso por páginas de alumnos, con el filtro y la búsqueda que aplica el servidor. */
export function useQuizAttempts(courseGuid: string, filter: AttemptFilter, search: string) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<AttemptsResponse>('/assessments/examiner/quizzes', {
        params: {
          course: courseGuid,
          result: filter === 'all' ? undefined : filter,
          search: search || undefined,
          cursor,
        },
      });
      return { items: attemptsByStudent(data.submissions), cursor: data.cursor };
    },
    [courseGuid, filter, search],
  );

  const attempts = usePagedList<StudentAttempts>(fetchPage, 'No se pudieron cargar los intentos del curso.');
  useLiveRefresh(LIST_EVENTS, attempts.refresh);
  return attempts;
}
