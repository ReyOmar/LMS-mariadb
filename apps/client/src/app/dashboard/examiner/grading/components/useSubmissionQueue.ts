'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { ExaminerSubmission, FilesRetired } from '../../types';
import { closeRoundOf, type SubmissionFilter } from './grouping';

const QUEUE_EVENTS: readonly RealtimeEvent[] = ['submission:new', 'submission:graded'];

interface SubmissionsResponse {
  cursor: string | null;
  submissions: ExaminerSubmission[];
}

/** Entregas de un curso por páginas, con el filtro y la búsqueda que aplica el servidor. */
export function useSubmissionQueue(courseGuid: string, filter: SubmissionFilter, search: string) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<SubmissionsResponse>('/assessments/examiner/submissions', {
        params: {
          course: courseGuid,
          status: filter === 'all' ? undefined : filter,
          search: search || undefined,
          cursor,
        },
      });
      return { items: data.submissions, cursor: data.cursor };
    },
    [courseGuid, filter, search],
  );

  const submissions = usePagedList<ExaminerSubmission>(fetchPage, 'No se pudieron cargar las entregas del curso.');
  const { refresh, updateItems } = submissions;

  useLiveRefresh(QUEUE_EVENTS, refresh);

  // La primera página llega al día con `refresh`; las cargadas con «Ver más» se corrigen aquí.
  useRealtimeEvent('submission:files-retired', (data) => {
    const retired = data as FilesRetired;
    if (retired.courseGuid !== courseGuid) return;
    updateItems((items) => closeRoundOf(items, retired.userGuid));
    void refresh();
  });

  return submissions;
}
