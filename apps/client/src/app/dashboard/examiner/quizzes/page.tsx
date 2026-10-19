'use client';

import api from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useLiveData } from '@/hooks/useLiveData';
import type { RealtimeEvent } from '@/lib/realtime/events';
import { useChosenCourse } from '../hooks/useChosenCourse';
import { QuizCourseDirectory } from './components/QuizCourseDirectory';
import { QuizCourseView } from './components/QuizCourseView';
import type { CourseQuizSummary } from './components/results';

const SUMMARY_EVENTS: readonly RealtimeEvent[] = ['submission:graded'];

async function fetchSummary(): Promise<CourseQuizSummary[]> {
  const { data } = await api.get<CourseQuizSummary[]>('/assessments/examiner/quizzes/summary');
  return data;
}

/** Analítica de los cuestionarios, que se corrigen solos: cifras por curso e historial de intentos. */
export default function QuizResults() {
  const summary = useLiveData(fetchSummary, 'No se pudieron cargar los cuestionarios.', SUMMARY_EVENTS);
  const { course, open, close } = useChosenCourse(summary.data);

  if (!summary.data) {
    return summary.error ? (
      <LoadFailed message={summary.error} onRetry={summary.retry} />
    ) : (
      <PageLoader message="Cargando resultados de los cuestionarios..." />
    );
  }

  if (!course) return <QuizCourseDirectory courses={summary.data} onPick={open} />;

  return <QuizCourseView course={course} onBack={close} onAttemptReleased={() => void summary.refresh()} />;
}
