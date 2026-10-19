'use client';

import api from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useLiveData } from '@/hooks/useLiveData';
import type { RealtimeEvent } from '@/lib/realtime/events';
import { useChosenCourse } from '../hooks/useChosenCourse';
import type { CourseSummary } from './components/grouping';
import { CourseSelector } from './components/CourseSelector';
import { GradingCourseView } from './components/GradingCourseView';

const SUMMARY_EVENTS: readonly RealtimeEvent[] = ['submission:new', 'submission:graded'];

async function fetchSummary(): Promise<CourseSummary[]> {
  const { data } = await api.get<CourseSummary[]>('/assessments/examiner/submissions/summary');
  return data;
}

/** Calificación manual de entregas. Los cuestionarios se corrigen solos y tienen su propio panel. */
export default function ManualGrading() {
  const summary = useLiveData(fetchSummary, 'No se pudieron cargar las entregas.', SUMMARY_EVENTS);
  const { course, open, close } = useChosenCourse(summary.data);

  if (!summary.data) {
    return summary.error ? (
      <LoadFailed message={summary.error} onRetry={summary.retry} />
    ) : (
      <PageLoader message="Cargando entregas para calificar..." />
    );
  }

  if (!course) return <CourseSelector courses={summary.data} onPick={open} />;

  return <GradingCourseView course={course} onBack={close} onGraded={() => void summary.refresh()} />;
}
