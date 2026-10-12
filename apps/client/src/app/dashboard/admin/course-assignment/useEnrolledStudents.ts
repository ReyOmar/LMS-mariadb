'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import type { EnrolledStudent } from './assignment';

interface EnrolledResponse {
  /** Sólo llega con la primera página. */
  total?: number;
  cursor: string | null;
  enrolledStudents: EnrolledStudent[];
}

export function useEnrolledStudents(courseGuid: string) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<EnrolledResponse>(`/enrollments/${encodeURIComponent(courseGuid)}`, {
        params: { cursor },
      });
      return { items: data.enrolledStudents ?? [], cursor: data.cursor, totals: data.total };
    },
    [courseGuid],
  );
  const enrolled = usePagedList<EnrolledStudent, number>(fetchPage, 'No se pudieron cargar las matrículas.');
  const { updateItems } = enrolled;

  const remove = useCallback(
    (guid: string) => updateItems((students) => students.filter((student) => student.guid !== guid)),
    [updateItems],
  );

  return { ...enrolled, remove };
}

export type EnrolledStudents = ReturnType<typeof useEnrolledStudents>;
