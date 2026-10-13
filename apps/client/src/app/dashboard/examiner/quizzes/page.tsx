'use client';

import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import type { RealtimeEvent } from '@/lib/realtime/events';
import { useSummary } from '../hooks/useSummary';
import { useChosenCourse } from '../hooks/useChosenCourse';
import { QuizCourseDirectory } from './components/QuizCourseDirectory';
import { QuizCourseView } from './components/QuizCourseView';
import type { CourseQuizSummary } from './components/results';

const SUMMARY_EVENTS: readonly RealtimeEvent[] = ['submission:graded'];

/** Analítica de los cuestionarios, que se corrigen solos: cifras por curso e historial de intentos. */
export default function QuizResults() {
  const summary = useSummary<CourseQuizSummary[]>('/assessments/examiner/quizzes/summary');
  const { course, open, close } = useChosenCourse(summary.data);
  useLiveRefresh(SUMMARY_EVENTS, summary.reload);

  if (!summary.data) {
    return summary.error ? (
      <LoadFailed message={summary.error} onRetry={() => void summary.reload()} />
    ) : (
      <PageLoader message="Cargando resultados de los cuestionarios..." />
    );
  }

  if (!course) return <QuizCourseDirectory courses={summary.data} onPick={open} />;

  return <QuizCourseView course={course} onBack={close} onAttemptReleased={() => void summary.reload()} />;
}
