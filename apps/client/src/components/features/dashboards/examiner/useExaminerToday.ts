'use client';

import api from '@/lib/api';
import { useLiveData } from '@/hooks/useLiveData';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { Course, MonitoringSummary } from '@/types/models';
import type { ExaminerSubmission } from '@/app/dashboard/examiner/types';
import type { CourseSummary } from '@/app/dashboard/examiner/grading/components/grouping';
import type { CourseQuizSummary } from '@/app/dashboard/examiner/quizzes/components/results';

const EVENTS: readonly RealtimeEvent[] = [
  'submission:new',
  'submission:graded',
  'round:closed',
  'course:created',
  'course:updated',
  'course:deleted',
];

/** Lo más que devuelve la cola de una sola vez (`MAX_PER_PAGE` en la API). */
const QUEUE_LIMIT = 200;

/** Alumno que agotó los intentos de un cuestionario sin superarlo y espera otro. */
export interface BlockedStudent {
  student: { guid: string; firstName: string; lastName: string };
  resourceGuid: string;
  quizTitle: string;
  courseGuid: string;
  courseTitle: string;
  attempts: number;
  allowedAttempts: number;
  lastAttemptAt: string | null;
  /** Nota del último intento, el que se retira al habilitar otro. */
  lastScore: number | null;
}

export interface ExaminerToday {
  courses: Course[];
  /** Bloqueados en un cuestionario, de quien más espera al último. */
  blocked: BlockedStudent[];
  /** Entregas por calificar, de la que más espera a la más reciente. */
  pending: ExaminerSubmission[];
  /** Total por calificar en todos sus cursos, aunque la lista no las traiga todas. */
  pendingTotal: number;
  pendingByCourse: Record<string, number>;
  /** Estudiantes de sus cursos y cuántos van por debajo del 25 % de avance. */
  students: number;
  lowProgress: number;
  /** Alumnos con formación en curso sin entrar desde hace más de `inactiveDays` días. */
  inactive: number;
  inactiveDays: number;
  quizzes: CourseQuizSummary[];
  hasSignature: boolean;
}

/** Entregas ordenadas de la que más espera a la más reciente. */
export function oldestFirst(submissions: ExaminerSubmission[]): ExaminerSubmission[] {
  return [...submissions].sort((a, b) => Date.parse(a.submittedAt ?? '') - Date.parse(b.submittedAt ?? ''));
}

async function fetchToday(): Promise<ExaminerToday> {
  const [courses, summary, monitoring, quizzes, signature, blocked] = await Promise.all([
    api.get<Course[]>('/courses'),
    api.get<CourseSummary[]>('/assessments/examiner/submissions/summary'),
    api.get<MonitoringSummary>('/dashboards/monitoring/summary'),
    api.get<CourseQuizSummary[]>('/assessments/examiner/quizzes/summary'),
    // La firma sólo cambia el aviso del panel: si no carga, se da por pendiente.
    api.get<{ signatureUrl: string | null }>('/settings/signature').catch(() => ({ data: { signatureUrl: null } })),
    api.get<BlockedStudent[]>('/assessments/examiner/quizzes/blocked'),
  ]);

  // La cola se pide curso a curso (así lo exige la API). Llega de la más reciente a la más antigua;
  // con más de `QUEUE_LIMIT` pendientes en un curso, las más antiguas quedan para la pantalla de calificación.
  const withPending = summary.data.filter((course) => course.pending > 0);
  const queues = await Promise.all(
    withPending.map((course) =>
      api.get<{ submissions: ExaminerSubmission[] }>('/assessments/examiner/submissions', {
        params: { course: course.courseGuid, status: 'pending', limit: QUEUE_LIMIT },
      }),
    ),
  );

  return {
    courses: Array.isArray(courses.data) ? courses.data : [],
    blocked: Array.isArray(blocked.data) ? blocked.data : [],
    pending: oldestFirst(queues.flatMap((queue) => queue.data.submissions)),
    pendingTotal: withPending.reduce((total, course) => total + course.pending, 0),
    pendingByCourse: Object.fromEntries(summary.data.map((course) => [course.courseGuid, course.pending])),
    students: monitoring.data.students,
    lowProgress: monitoring.data.ranges[0] ?? 0,
    inactive: monitoring.data.inactive ?? 0,
    inactiveDays: monitoring.data.inactiveDays,
    quizzes: quizzes.data,
    hasSignature: Boolean(signature.data.signatureUrl),
  };
}

/** Lo que el examinador tiene que hacer hoy y cómo van sus cursos, al día con las entregas. */
export function useExaminerToday() {
  return useLiveData(fetchToday, 'No se pudo cargar tu día.', EVENTS);
}
