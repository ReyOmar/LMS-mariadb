import { averageScore, toScore } from '@/lib/grading';
import { displayTitle } from '@/lib/resources';
import { COLOR, type Slice } from '@/components/ui/charts';
import { twoWayBreakdown, type ThresholdSummary } from '../../components/summary-charts';
import { closeRoundOf, type ClosedRound } from '../../closed-round';
import type { ExaminerSubmission, QuizAttempt } from '../../types';

// Cuenta la mejor nota de cada alumno, no cada intento: contar intentos infla el total y hunde el promedio.

export type AttemptFilter = 'all' | 'passed' | 'failed';

/** Cifras de un curso, contadas por la base sobre la mejor nota de cada alumno. */
export interface CourseQuizSummary extends ThresholdSummary {
  /** Alumnos con al menos un intento corregido. Es la base de las demás cifras. */
  assessed: number;
  passedCount: number;
  failed: number;
  /** Media de las mejores notas, en la escala del sistema. */
  average: number;
}

/** La marca de cuestionario es interna; el examinador ve el título sin ella. */
export function stripQuizMarker(title: string | null | undefined): string {
  return displayTitle({ type: 'ASSIGNMENT', title: title ?? 'Sin título' }).trim();
}

export function getAttemptScore(submission: Pick<ExaminerSubmission, 'score'>): number | null {
  return toScore(submission.score);
}

/** La mejor de varias notas, ignorando los intentos sin nota. */
export function bestScore(submissions: ExaminerSubmission[]): number | null {
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

/** Cifras de todos los cursos, con el promedio ponderado por alumnos evaluados y no por curso. */
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
    rate: passRate({ assessed, passedCount }),
  };
}

export function resultBreakdown(passedCount: number, failed: number): Slice[] {
  return twoWayBreakdown(
    { name: 'Aprobados', value: passedCount, color: COLOR.passed },
    { name: 'Reprobados', value: failed, color: COLOR.failed },
    'Sin calificar',
  );
}

export interface StudentWithAttempts {
  student: QuizAttempt['student'];
  /** Del más reciente al más antiguo, que es el orden en que se revisa. */
  attempts: QuizAttempt[];
  bestScore: number | null;
  attemptCount: number;
}

interface QuizWithStudents {
  /** Identifica el grupo: dos cuestionarios pueden llamarse igual. */
  key: string;
  assignmentGuid: string | null;
  assignmentTitle: string;
  allowedAttempts: number | null;
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

/** Ordena los intentos en módulo → cuestionario → alumno, por identificador y no por título. */
export function groupByModuleAndQuiz(submissions: QuizAttempt[]): ModuleWithQuizzes[] {
  const byModule = new Map<
    string,
    {
      title: string;
      assignments: Map<
        string,
        { guid: string | null; title: string; allowedAttempts: number | null; students: Map<string, QuizAttempt[]> }
      >;
    }
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
      assignments.set(assignmentKey, {
        guid: submission.assignmentGuid,
        title: stripQuizMarker(submission.assignmentTitle),
        allowedAttempts: submission.allowedAttempts,
        students: new Map(),
      });
    }
    const students = assignments.get(assignmentKey)!.students;
    if (!students.has(student)) students.set(student, []);
    students.get(student)!.push(submission);
  }

  return Array.from(byModule.entries()).map(([moduleKey, { title: moduleTitle, assignments: assignmentsMap }]) => {
    const moduleScores: number[] = [];

    const assignments = Array.from(assignmentsMap.entries()).map(
      ([assignmentKey, { guid: assignmentGuid, title: assignmentTitle, allowedAttempts, students: studentsMap }]) => {
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

        students.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
        moduleScores.push(...assignmentScores);

        return {
          key: assignmentKey,
          assignmentGuid,
          assignmentTitle,
          allowedAttempts,
          students,
          average: averageOf(assignmentScores),
        };
      },
    );

    return { key: moduleKey, moduleTitle, assignments, average: averageOf(moduleScores) };
  });
}

/** Intentos de un alumno: la página avanza por alumno y de cada uno llegan todos los suyos. */
export interface StudentAttempts {
  /** El del alumno, para que una página nueva sustituya entero lo que había de él. */
  guid: string;
  attempts: QuizAttempt[];
}

export function attemptsByStudent(attempts: QuizAttempt[]): StudentAttempts[] {
  const byStudent = new Map<string, QuizAttempt[]>();
  for (const attempt of attempts) {
    const student = attempt.student?.guid ?? attempt.guid;
    const loaded = byStudent.get(student);
    if (loaded) loaded.push(attempt);
    else byStudent.set(student, [attempt]);
  }
  return Array.from(byStudent, ([guid, list]) => ({ guid, attempts: list }));
}

/** Lo cargado sin el intento retirado: si el alumno llegó con «Ver más», la primera página no lo trae. */
export function withoutAttempt(rows: StudentAttempts[], attemptGuid: string): StudentAttempts[] {
  return rows.map((row) => ({ ...row, attempts: row.attempts.filter((attempt) => attempt.guid !== attemptGuid) }));
}

/** Al certificarse un alumno, sus intentos cargados del curso quedan cerrados: ya no se le habilita otro. */
export function closeRoundIn(rows: StudentAttempts[], round: ClosedRound): StudentAttempts[] {
  return rows.map((row) =>
    row.guid === round.userGuid ? { ...row, attempts: closeRoundOf(row.attempts, round) } : row,
  );
}

/**
 * Intento que se retira para devolverle uno al alumno: el más reciente, y sólo si agotó los
 * permitidos sin aprobar y su vuelta sigue abierta, que es lo único que acepta la API.
 */
export function releasableAttempt(
  student: StudentWithAttempts,
  threshold: number,
  allowedAttempts: number | null,
): QuizAttempt | null {
  const latest = student.attempts[0];
  const passed = student.bestScore !== null && student.bestScore >= threshold;
  const exhausted = allowedAttempts !== null && allowedAttempts > 0 && student.attemptCount >= allowedAttempts;
  return latest && !latest.roundClosed && !passed && exhausted ? latest : null;
}
