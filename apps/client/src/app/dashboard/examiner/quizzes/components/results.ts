import type { SubmissionToGrade } from '@/types/models';
import { averageScore, toScore } from '@/lib/grading';
import { COLOR, type Slice, type RangeBucket } from '@/components/ui/charts';

/**
 * Cómo se resumen los intentos de cuestionario.
 *
 * La diferencia con las tareas es que aquí un alumno deja **varios intentos** del mismo
 * cuestionario, y lo que cuenta para todas las cifras —promedio, tasa de aprobación,
 * reparto— es su **mejor nota**, no cada intento por separado. Confundir ambas cosas es el
 * error fácil: contar intentos infla el total y hunde el promedio de quien repitió.
 *
 * Esas cifras las calcula el servidor sobre el curso entero
 * (`/assessments/examiner/quizzes/summary`), porque la lista llega por páginas y contarlas
 * aquí describiría lo cargado. Lo que queda aquí es dar forma a lo que hay en pantalla; y
 * puede hacerlo con confianza porque la página avanza **por alumno**: de cada uno vienen
 * todos sus intentos, así que su historial nunca está partido.
 *
 * Son funciones puras para poder razonarlas sin montar la pantalla.
 */

export type AttemptFilter = 'all' | 'passed' | 'failed';

/** Cifras de un curso, tal y como las cuenta la base sobre la mejor nota de cada alumno. */
export interface CourseQuizSummary {
  courseGuid: string;
  title: string;
  coverImage: string | null;
  /** Nota mínima para aprobar en este curso. */
  threshold: number;
  /** Frontera del tramo intermedio: por debajo, la nota ni se acercó a aprobar. */
  borderline: number;
  /** Intentos registrados, contando los repetidos de un mismo alumno. */
  attempts: number;
  /** Alumnos con al menos un intento corregido. Es la base de las demás cifras. */
  assessed: number;
  passedCount: number;
  failed: number;
  /** Media de las mejores notas, en la escala del sistema. */
  average: number;
  scores: { low: number; mid: number; high: number };
}

/** La marca `[QUIZ] ` es interna; el examinador ve el título sin ella. */
export function stripQuizMarker(title: string | null | undefined): string {
  return (title ?? 'Sin título').replace('[QUIZ] ', '').trim();
}

/** Nota de un intento, o `null` si todavía no se corrigió. */
export function getAttemptScore(submission: Pick<SubmissionToGrade, 'status' | 'score'>): number | null {
  return submission.status === 'GRADED' ? toScore(submission.score) : null;
}

/** La mejor de varias notas, ignorando los intentos sin corregir. */
export function bestScore(submissions: SubmissionToGrade[]): number | null {
  let best: number | null = null;
  for (const submission of submissions) {
    const score = getAttemptScore(submission);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/** Tasa de aprobación de un curso, en porcentaje entero. */
export function passRate(course: Pick<CourseQuizSummary, 'assessed' | 'passedCount'>): number {
  return course.assessed > 0 ? Math.round((course.passedCount / course.assessed) * 100) : 0;
}

/**
 * Cifras de todos los cursos juntos, para la portada del panel.
 * El promedio se pondera por alumnos evaluados: la media de las medias daría el mismo peso
 * a un curso de diez personas que a uno de mil.
 */
export function globalStats(courses: CourseQuizSummary[]) {
  let assessed = 0;
  let passedCount = 0;
  let sum = 0;

  for (const course of courses) {
    assessed += course.assessed;
    passedCount += course.passedCount;
    sum += course.average * course.assessed;
  }

  return {
    assessed,
    passedCount,
    failed: assessed - passedCount,
    average: assessed > 0 ? sum / assessed : 0,
    rate: assessed > 0 ? Math.round((passedCount / assessed) * 100) : 0,
  };
}

/**
 * Reparto de las mejores notas en tres tramos.
 * Los tres números vienen contados de la base; aquí sólo se les pone nombre y color.
 */
export function scoreDistribution(
  course: Pick<CourseQuizSummary, 'threshold' | 'borderline' | 'scores'>,
): RangeBucket[] {
  const { threshold, borderline, scores } = course;

  return [
    { name: `Por debajo de ${borderline}`, count: scores.low, fill: COLOR.failed },
    { name: `Entre ${borderline} y ${threshold - 1}`, count: scores.mid, fill: COLOR.pending },
    { name: `${threshold} o más (aprobado)`, count: scores.high, fill: COLOR.passed },
  ].filter((range) => range.count > 0);
}

/** Aprobados frente a reprobados. Sin notas devuelve una porción gris. */
export function resultBreakdown(passedCount: number, failed: number): Slice[] {
  if (passedCount + failed === 0) {
    return [{ name: 'Sin calificar', value: 1, color: COLOR.empty }];
  }

  return [
    { name: 'Aprobados', value: passedCount, color: COLOR.passed },
    { name: 'Reprobados', value: failed, color: COLOR.failed },
  ].filter((slice) => slice.value > 0);
}

export interface StudentWithAttempts {
  student: SubmissionToGrade['student'];
  /** Del más reciente al más antiguo, que es el orden en que se revisa. */
  attempts: SubmissionToGrade[];
  bestScore: number | null;
  attemptCount: number;
}

interface QuizWithStudents {
  /** Identifica el grupo: dos cuestionarios pueden llamarse igual. */
  key: string;
  assignmentTitle: string;
  students: StudentWithAttempts[];
  average: number;
}

interface ModuleWithQuizzes {
  /** Identifica el grupo: dos módulos pueden llamarse igual. */
  key: string;
  moduleTitle: string;
  assignments: QuizWithStudents[];
  average: number;
}

/** Media de las notas, o 0 si todavía no hay ninguna. */
function averageOf(scores: number[]): number {
  return averageScore(scores) ?? 0;
}

/**
 * Ordena los intentos en módulo → cuestionario → alumno, que es como los revisa el examinador.
 *
 * Se agrupa por identificador y no por título: dos cuestionarios que se llamen igual —o dos
 * módulos «Introducción»— son grupos distintos, y la mejor nota de un alumno no puede salir
 * de un cuestionario que no es el suyo.
 */
export function groupByModuleAndQuiz(submissions: SubmissionToGrade[]): ModuleWithQuizzes[] {
  const byModule = new Map<
    string,
    { title: string; assignments: Map<string, { title: string; students: Map<string, SubmissionToGrade[]> }> }
  >();

  for (const submission of submissions) {
    const moduleKey = submission.moduleGuid || submission.moduleTitle || 'no-module';
    const assignmentKey = submission.assignmentGuid || submission.assignmentTitle;
    const student = submission.student?.guid || 'unknown';

    if (!byModule.has(moduleKey)) {
      byModule.set(moduleKey, { title: submission.moduleTitle || 'Módulo principal', assignments: new Map() });
    }
    const assignments = byModule.get(moduleKey)!.assignments;
    if (!assignments.has(assignmentKey)) {
      assignments.set(assignmentKey, { title: stripQuizMarker(submission.assignmentTitle), students: new Map() });
    }
    const students = assignments.get(assignmentKey)!.students;
    if (!students.has(student)) students.set(student, []);
    students.get(student)!.push(submission);
  }

  return Array.from(byModule.entries()).map(([moduleKey, { title: moduleTitle, assignments: assignmentsMap }]) => {
    const moduleScores: number[] = [];

    const assignments = Array.from(assignmentsMap.entries()).map(
      ([assignmentKey, { title: assignmentTitle, students: studentsMap }]) => {
        const assignmentScores: number[] = [];

        const students: StudentWithAttempts[] = Array.from(studentsMap.values()).map((attempts) => {
          const sorted = [...attempts].sort(
            (a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime(),
          );
          const best = bestScore(sorted);
          if (best !== null) assignmentScores.push(best);

          return {
            student: sorted[0].student,
            attempts: sorted,
            bestScore: best,
            attemptCount: sorted.length,
          };
        });

        // De mejor a peor nota: quien necesita atención queda al final de la lista.
        students.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
        moduleScores.push(...assignmentScores);

        return { key: assignmentKey, assignmentTitle, students, average: averageOf(assignmentScores) };
      },
    );

    return { key: moduleKey, moduleTitle, assignments, average: averageOf(moduleScores) };
  });
}
