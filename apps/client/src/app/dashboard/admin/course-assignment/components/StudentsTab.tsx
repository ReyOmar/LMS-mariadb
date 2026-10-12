'use client';

import { useState } from 'react';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useDebounce } from '@/hooks/useDebounce';
import { searchQuery } from '@/lib/search';
import { useEnrolledStudents } from '../useEnrolledStudents';
import { useCandidates } from '../useCandidates';
import { useCandidateSelection } from '../useCandidateSelection';
import { useEnrollmentActions } from '../useEnrollmentActions';
import { EnrolledStudentsPanel } from './EnrolledStudentsPanel';
import { CandidatePicker } from './CandidatePicker';

const SEARCH_DELAY_MS = 300;

interface Props {
  courseGuid: string;
  /** Mientras dura una matrícula en bloque no se cambia de curso: su avance es del abierto. */
  onBatchRunningChange: (running: boolean) => void;
}

export function StudentsTab({ courseGuid, onBatchRunningChange }: Props) {
  const [search, setSearch] = useState('');
  const appliedSearch = searchQuery(useDebounce(search, SEARCH_DELAY_MS));
  const enrolled = useEnrolledStudents(courseGuid);
  const candidates = useCandidates(courseGuid, appliedSearch);
  const selection = useCandidateSelection();

  const refreshLists = () => {
    void enrolled.refresh();
    void candidates.refresh();
  };

  const actions = useEnrollmentActions(courseGuid, {
    onEnrolled: (guids) => {
      candidates.drop(guids);
      selection.drop(guids);
    },
    onUnenrolled: enrolled.remove,
    refreshLists,
  });

  // Cada alta propia de una matrícula en bloque también avisa: se refresca una sola vez al terminar.
  useRealtimeEvent('enrollment:changed', (data) => {
    const changedCourse = (data as { courseGuid?: string } | null)?.courseGuid;
    if (actions.batchProgress || (changedCourse && changedCourse !== courseGuid)) return;
    refreshLists();
  });
  useRealtimeReconnect(refreshLists);

  const enrollSelected = async () => {
    onBatchRunningChange(true);
    try {
      await actions.enrollBatch(selection.selected);
    } finally {
      onBatchRunningChange(false);
    }
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full 2xl:h-full">
      <EnrolledStudentsPanel enrolled={enrolled} onUnenroll={(student) => void actions.unenroll(student)} />
      <CandidatePicker
        candidates={candidates}
        search={search}
        onSearch={setSearch}
        searchPending={searchQuery(search) !== appliedSearch}
        selection={selection}
        batchProgress={actions.batchProgress}
        isEnrolling={actions.isEnrolling}
        onEnroll={(candidate) => void actions.enrollOne(candidate)}
        onEnrollSelected={() => void enrollSelected()}
      />
    </div>
  );
}
