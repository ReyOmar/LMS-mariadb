'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

/**
 * Calificación manual de entregas. Los cuestionarios se corrigen solos y tienen su propio panel.
 * Con `?course=` (desde «Hoy») se abre directamente ese curso.
 */
export default function ManualGradingPage() {
  // `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página.
  return (
    <Suspense fallback={<PageLoader message="Cargando entregas para calificar..." />}>
      <ManualGrading />
    </Suspense>
  );
}

function ManualGrading() {
  const requestedCourse = useSearchParams().get('course');
  const summary = useLiveData(fetchSummary, 'No se pudieron cargar las entregas.', SUMMARY_EVENTS);
  const { course, open, close } = useChosenCourse(summary.data, requestedCourse);

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
