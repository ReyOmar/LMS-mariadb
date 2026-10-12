import type { CourseStatus, UserRole } from '@/types/models';
import { matchesSearch, plural } from '@/lib/text';

export interface Person {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl?: string | null;
}

export interface Candidate extends Person {
  /** Ya tiene el certificado de este curso: matricularlo de nuevo lo hace empezar de cero. */
  certified: boolean;
}

export interface EnrolledStudent extends Person {
  enrolledAt: string;
}

/** Responsable del curso: un examinador o, si no se ha asignado a nadie, un administrador. */
export interface CourseHolder {
  guid: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AssignableCourse {
  guid: string;
  title: string;
  status: CourseStatus;
  teacherGuid: string;
  teacher: CourseHolder;
}

export type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

/** Todo curso tiene responsable: «sin asignar» es un curso que sigue a cargo de un administrador. */
export function hasExaminer(course: Pick<AssignableCourse, 'teacher'>): boolean {
  return course.teacher.role === 'TEACHER';
}

/** Candidatos que el servidor entrega de una vez: con la lista llena hay que afinar la búsqueda. */
export const CANDIDATES_SHOWN = 50;

export function fullName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${person.firstName} ${person.lastName}`;
}

export function restartWarning(names: readonly string[]): string {
  if (names.length === 1) {
    return (
      `${names[0]} ya tiene el certificado de este curso. Si lo matriculas de nuevo, empezará desde cero: su ` +
      'avance se reinicia; sus calificaciones anteriores quedan en el historial (los archivos ya se retiraron al ' +
      'emitir su certificado). El certificado emitido se conserva.'
    );
  }
  return (
    `Ya tienen el certificado de este curso: ${names.join(', ')}. Si los matriculas de nuevo, empezarán desde ` +
    'cero: su avance se reinicia; sus calificaciones anteriores quedan en el historial (los archivos ya se ' +
    'retiraron al emitir sus certificados). Los certificados emitidos se conservan.'
  );
}

export const UNENROLL_WARNING =
  'Perderá el acceso al curso. Su avance y sus entregas se conservan: si vuelves a matricularlo antes de que ' +
  'obtenga el certificado, retomará el curso donde lo dejó. Un cuestionario que tenga abierto se cierra y ese ' +
  'intento cuenta como gastado.';

export interface EnrollmentFailure {
  name: string;
  reason: string;
}

/** Nombres que se citan por motivo en el resumen; del resto sólo se dice cuántos son. */
const NAMES_PER_REASON = 5;

function nameList(names: readonly string[]): string {
  if (names.length <= NAMES_PER_REASON) return names.join(', ');
  return `${names.slice(0, NAMES_PER_REASON).join(', ')} y ${names.length - NAMES_PER_REASON} más`;
}

/** Resumen de una matrícula en bloque, con los rechazos agrupados por motivo para no repetirlos. */
export function batchSummary(
  added: number,
  failures: readonly EnrollmentFailure[],
): { title: string; message: string } {
  const attempted = added + failures.length;
  const title =
    failures.length === 0
      ? `${added} ${plural(added, 'estudiante matriculado', 'estudiantes matriculados')}`
      : added === 0
        ? 'No se pudo matricular a ningún estudiante'
        : `Se matriculó a ${added} de ${attempted} estudiantes`;

  const byReason = new Map<string, string[]>();
  for (const { name, reason } of failures) byReason.set(reason, [...(byReason.get(reason) ?? []), name]);
  const message = [...byReason].map(([reason, names]) => `${nameList(names)}: ${reason}`).join(' ');

  return { title, message };
}

export function filterCourses(
  courses: readonly AssignableCourse[],
  search: string,
  filter: AssignmentFilter,
): AssignableCourse[] {
  return courses.filter((course) => {
    if (!matchesSearch(course.title, search)) return false;
    if (filter === 'assigned') return hasExaminer(course);
    if (filter === 'unassigned') return !hasExaminer(course);
    return true;
  });
}

export function directoryCount(shown: number, total: number): string {
  if (shown === total) return `${total} ${plural(total, 'curso', 'cursos')} en total`;
  return `${shown} de ${total} ${plural(total, 'curso', 'cursos')}`;
}
