import type { SubmissionToGrade } from '@/types/models';
import { MAX_SCORE, formatPoints } from '@/lib/grading';
import { COLOR, type Slice, type RangeBucket } from '@/components/ui/charts';

/**
 * Cómo se ordenan las entregas para el examinador.
 *
 * Aquí queda sólo lo que se puede decidir con lo que hay en pantalla: agrupar la página
 * cargada y dar forma a las gráficas. **Contar no está**: los totales de un curso, el
 * reparto por estado y el de notas los calcula el servidor (`/assessments/examiner/submissions/summary`)
 * porque necesitan todas las entregas del curso, y la lista ya sólo trae una página.
 * Contarlas aquí daría cifras que describen lo cargado y no el curso.
 *
 * Son funciones puras a propósito: separadas del marcado se pueden comprobar sin montar
 * la pantalla.
 */

export type SubmissionFilter = 'all' | 'pending' | 'graded';

/** Cifras de un curso, tal y como las cuenta la base. */
export interface CourseSummary {
  courseGuid: string;
  title: string;
  coverImage: string | null;
  /** Nota mínima para aprobar en este curso. */
  threshold: number;
  /** Frontera del tramo intermedio: por debajo, la nota ni se acercó a aprobar. */
  borderline: number;
  total: number;
  pending: number;
  graded: number;
  scores: { low: number; mid: number; high: number };
}

interface AssignmentWithSubmissions {
  /** Identifica el grupo: dos tareas pueden llamarse igual. */
  key: string;
  assignmentTitle: string;
  submissions: SubmissionToGrade[];
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

export function isGraded(submission: Pick<SubmissionToGrade, 'status'>): boolean {
  return submission.status === 'GRADED';
}

/**
 * Reparto de las notas ya puestas en tres tramos.
 * Los tres números vienen contados de la base; aquí sólo se les pone nombre y color. Se
 * describen respecto al umbral de aprobación y no a números sueltos: si el curso cambia su
 * mínimo, la gráfica sigue diciendo algo útil.
 */
export function scoreDistribution(course: Pick<CourseSummary, 'threshold' | 'borderline' | 'scores'>): RangeBucket[] {
  const { threshold, borderline, scores } = course;

  return [
    { name: `Por debajo de ${borderline}`, count: scores.low, fill: COLOR.failed },
    { name: `Entre ${borderline} y ${threshold - 1}`, count: scores.mid, fill: COLOR.pending },
    { name: `${threshold} o más (aprobado)`, count: scores.high, fill: COLOR.passed },
  ].filter((range) => range.count > 0);
}

/** Pendientes frente a calificadas. Sin entregas devuelve una porción gris, para no dejar el hueco en blanco. */
export function statusBreakdown(pending: number, graded: number): Slice[] {
  if (pending + graded === 0) {
    return [{ name: 'Sin entregas', value: 1, color: COLOR.empty }];
  }

  return [
    { name: 'Pendientes', value: pending, color: COLOR.pending },
    { name: 'Calificadas', value: graded, color: COLOR.passed },
  ].filter((slice) => slice.value > 0);
}

/** Ordena las entregas en módulo → tarea → alumnos, que es como las recorre el examinador. */
export function groupByModuleAndAssignment(submissions: SubmissionToGrade[]): ModuleWithAssignments[] {
  // Por identificador, no por título: dos tareas que se llamen igual no son la misma tarea.
  const byModule = new Map<
    string,
    { title: string; assignments: Map<string, { title: string; list: SubmissionToGrade[] }> }
  >();

  for (const submission of submissions) {
    const moduleKey = submission.moduleGuid || submission.moduleTitle || 'no-module';
    const assignmentKey = submission.assignmentGuid || submission.assignmentTitle || 'no-assignment';

    if (!byModule.has(moduleKey)) {
      byModule.set(moduleKey, { title: submission.moduleTitle || 'Módulo principal', assignments: new Map() });
    }
    const assignments = byModule.get(moduleKey)!.assignments;
    if (!assignments.has(assignmentKey))
      assignments.set(assignmentKey, { title: submission.assignmentTitle || 'Sin título', list: [] });
    assignments.get(assignmentKey)!.list.push(submission);
  }

  return Array.from(byModule.entries()).map(([moduleKey, { title: moduleTitle, assignments: assignmentsMap }]) => {
    const assignments: AssignmentWithSubmissions[] = Array.from(assignmentsMap.entries()).map(
      ([assignmentKey, { title: assignmentTitle, list }]) => {
        const pending = list.filter((e) => !isGraded(e)).length;
        return { key: assignmentKey, assignmentTitle, submissions: list, pending, graded: list.length - pending };
      },
    );

    return {
      key: moduleKey,
      moduleTitle,
      assignments,
      pending: assignments.reduce((sum, t) => sum + t.pending, 0),
      graded: assignments.reduce((sum, t) => sum + t.graded, 0),
    };
  });
}

/**
 * Limpia lo que el examinador teclea en el campo de nota.
 *
 * Acepta enteros y un solo decimal dentro de 0–{@link MAX_SCORE}. Lo que no encaja no
 * llega a escribirse: el error se evita en lugar de tener que explicarlo después de enviar.
 *
 * La coma vale como separador decimal: es el de Colombia y el que ofrece el teclado numérico
 * del móvil en español. Descartarla convertía «85,5» en 855 y la nota quedaba en 100.
 */
export function normalizeTypedScore(value: string): string {
  let cleaned = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');

  const parts = cleaned.split('.');
  if (parts.length > 2) cleaned = `${parts[0]}.${parts.slice(1).join('')}`;

  if (cleaned === '') return '';
  if (cleaned === '.') return '0.';

  const [integerPart, decimal] = cleaned.split('.');
  if (Number(integerPart) > MAX_SCORE) return String(MAX_SCORE);
  if (decimal !== undefined && decimal.length > 1) return `${integerPart}.${decimal.slice(0, 1)}`;

  return cleaned;
}

/**
 * Con qué se abre el panel de calificación.
 *
 * Al corregir una nota ya puesta se parte de ella. Una entrega por calificar —también la
 * versión corregida de una que suspendió— empieza vacía: la nota y el comentario anteriores
 * sólo se enseñan como referencia, para no volver a enviar por descuido los del suspenso.
 */
export function gradingStart(submission: Pick<SubmissionToGrade, 'status' | 'score' | 'feedback'>): {
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

/** Porcentaje de avance de la corrección, para la barra de la tarjeta de curso. */
export function gradedPercent(course: Pick<CourseSummary, 'total' | 'graded'>): number {
  return course.total > 0 ? Math.round((course.graded / course.total) * 100) : 100;
}

/** Suma de los cursos, para las cifras de portada del selector. */
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
