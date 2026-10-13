'use client';

import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import { useSummary } from '../hooks/useSummary';
import { useChosenCourse } from '../hooks/useChosenCourse';
import type { CourseSummary } from './components/grouping';
import { CourseSelector } from './components/CourseSelector';
import { GradingCourseView } from './components/GradingCourseView';

const SUMMARY_EVENTS: readonly RealtimeEvent[] = ['submission:new', 'submission:graded'];

/** Calificación manual de entregas. Los cuestionarios se corrigen solos y tienen su propio panel. */
export default function ManualGrading() {
  const summary = useSummary<CourseSummary[]>('/assessments/examiner/submissions/summary');
  const { course, open, close } = useChosenCourse(summary.data);
  useLiveRefresh(SUMMARY_EVENTS, summary.reload);

  if (!summary.data) {
    return summary.error ? (
      <LoadFailed message={summary.error} onRetry={() => void summary.reload()} />
    ) : (
      <PageLoader message="Cargando entregas para calificar..." />
    );
  }

  if (!course) return <CourseSelector courses={summary.data} onPick={open} />;

  return <GradingCourseView course={course} onBack={close} onGraded={() => void summary.reload()} />;
}
