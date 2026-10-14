import { MAX_SCORE, formatPoints } from '@/lib/grading';
import { COLOR, type Slice } from '@/components/ui/charts';
import { twoWayBreakdown, type ThresholdSummary } from '../../components/summary-charts';
import type { ExaminerSubmission } from '../../types';

// Las cifras del curso las cuenta el servidor sobre todas sus entregas; aquí sólo se agrupa la página cargada.

export type SubmissionFilter = 'all' | 'pending' | 'graded';

export interface CourseSummary extends ThresholdSummary {
  coverImage: string | null;
  total: number;
  pending: number;
  graded: number;
}

interface AssignmentWithSubmissions {
  /** Identifica el grupo: dos tareas pueden llamarse igual. */
  key: string;
  assignmentTitle: string;
  submissions: ExaminerSubmission[];
  pending: number;
  graded: number;
}

export interface ModuleWithAssignments {
  /** Identifica el grupo: dos módulos pueden llamarse igual. */
  key: string;
  moduleTitle: string;
  assignments: AssignmentWithSubmissions[];
  pending: number;
  graded: number;
}

export function isGraded(submission: Pick<ExaminerSubmission, 'status'>): boolean {
  return submission.status === 'GRADED';
}

export function statusBreakdown(pending: number, graded: number): Slice[] {
  return twoWayBreakdown(
    { name: 'Pendientes', value: pending, color: COLOR.pending },
    { name: 'Calificadas', value: graded, color: COLOR.passed },
    'Sin entregas',
  );
}

/** Cuántas entregas del curso cumplen el filtro, según las cifras del servidor. */
export function filteredTotal(course: Pick<CourseSummary, 'total' | 'pending' | 'graded'>, filter: SubmissionFilter) {
  if (filter === 'pending') return course.pending;
  if (filter === 'graded') return course.graded;
  return course.total;
}

/** Ordena las entregas en módulo → tarea → alumnos, por identificador y no por título. */
export function groupByModuleAndAssignment(submissions: ExaminerSubmission[]): ModuleWithAssignments[] {
  const byModule = new Map<
    string,
    { title: string; assignments: Map<string, { title: string; list: ExaminerSubmission[] }> }
  >();

  for (const submission of submissions) {
    const moduleKey = submission.moduleGuid || submission.moduleTitle || 'no-module';
    const assignmentKey = submission.assignmentGuid || submission.assignmentTitle || 'no-assignment';

    if (!byModule.has(moduleKey)) {
      byModule.set(moduleKey, { title: submission.moduleTitle || 'Módulo principal', assignments: new Map() });
    }
    const assignments = byModule.get(moduleKey)!.assignments;
    if (!assignments.has(assignmentKey)) {
      assignments.set(assignmentKey, { title: submission.assignmentTitle || 'Sin título', list: [] });
    }
    assignments.get(assignmentKey)!.list.push(submission);
  }

  return Array.from(byModule.entries()).map(([moduleKey, { title: moduleTitle, assignments: assignmentsMap }]) => {
    const assignments: AssignmentWithSubmissions[] = Array.from(assignmentsMap.entries()).map(
      ([assignmentKey, { title: assignmentTitle, list }]) => {
        const pending = list.filter((submission) => !isGraded(submission)).length;
        return { key: assignmentKey, assignmentTitle, submissions: list, pending, graded: list.length - pending };
      },
    );

    return {
      key: moduleKey,
      moduleTitle,
      assignments,
      pending: assignments.reduce((sum, assignment) => sum + assignment.pending, 0),
      graded: assignments.reduce((sum, assignment) => sum + assignment.graded, 0),
    };
  });
}

/**
 * Limpia lo que se teclea en el campo de nota: enteros y un decimal dentro de 0–{@link MAX_SCORE}.
 * La coma vale como separador decimal: es la de Colombia y la del teclado numérico del móvil.
 */
export function normalizeTypedScore(value: string): string {
  let cleaned = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');

  const parts = cleaned.split('.');
  if (parts.length > 2) cleaned = `${parts[0]}.${parts.slice(1).join('')}`;

  if (cleaned === '') return '';
  if (cleaned === '.') return '0.';

  const [integerPart, decimal] = cleaned.split('.');
  const integer = Number(integerPart);
  if (integer > MAX_SCORE || (integer === MAX_SCORE && decimal !== undefined)) return String(MAX_SCORE);
  if (decimal !== undefined && decimal.length > 1) return `${integerPart}.${decimal.slice(0, 1)}`;

  return cleaned;
}

/**
 * Con qué se abre el panel: una nota puesta se corrige partiendo de ella; una entrega por calificar
 * empieza vacía y la anterior sólo se enseña, para no reenviar por descuido la del suspenso.
 */
export function gradingStart(submission: Pick<ExaminerSubmission, 'status' | 'score' | 'feedback'>): {
  score: string;
  feedback: string;
  previous: { score: number | null; feedback: string | null } | null;
} {
  if (isGraded(submission)) {
    return {
      score: submission.score == null ? '' : formatPoints(submission.score),
      feedback: submission.feedback ?? '',
      previous: null,
    };
  }
  const hasPrevious = submission.score != null || Boolean(submission.feedback);
  return {
    score: '',
    feedback: '',
    previous: hasPrevious ? { score: submission.score ?? null, feedback: submission.feedback || null } : null,
  };
}

/** Porcentaje corregido del curso; sin entregas no queda nada pendiente. */
export function gradedPercent(course: Pick<CourseSummary, 'total' | 'graded'>): number {
  return course.total > 0 ? Math.round((course.graded / course.total) * 100) : 100;
}

export function countryTotals(courses: CourseSummary[]): { total: number; pending: number; graded: number } {
  return courses.reduce(
    (sum, course) => ({
      total: sum.total + course.total,
      pending: sum.pending + course.pending,
      graded: sum.graded + course.graded,
    }),
    { total: 0, pending: 0, graded: 0 },
  );
}
