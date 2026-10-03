import type { CourseStatus, UserRole } from '@/types/models';

/** Lo que la pantalla de asignación necesita de cada curso. */
export interface AssignableCourse {
  guid: string;
  title: string;
  status: CourseStatus;
  teacherGuid: string;
  /** Responsable del curso: un examinador o, si no se ha asignado a nadie, un administrador. */
  teacher: { guid: string; firstName: string; lastName: string; role: UserRole };
}

export type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

/**
 * ¿Tiene el curso un examinador asignado?
 *
 * Todo curso tiene responsable —es obligatorio en la base de datos—, así que «sin asignar»
 * no es un `teacherGuid` vacío: es un curso que sigue a cargo de un administrador.
 */
export function hasExaminer(course: Pick<AssignableCourse, 'teacher'>): boolean {
  return course.teacher.role === 'TEACHER';
}

/** Candidatos que el servidor entrega de una vez: con la lista llena hay que afinar la búsqueda. */
export const CANDIDATES_SHOWN = 50;

/** Con menos caracteres no se busca: una sola letra casa con casi toda la sede. */
export const MIN_SEARCH_LENGTH = 2;

/** Texto con el que se piden los candidatos; vacío si no llega al mínimo, y entonces no se filtra. */
export function candidateSearch(typed: string): string {
  const text = typed.trim();
  return text.length >= MIN_SEARCH_LENGTH ? text : '';
}

/** ¿Hay algo escrito, pero todavía no basta para buscar? */
export function isSearchTooShort(typed: string): boolean {
  return typed.trim().length > 0 && candidateSearch(typed) === '';
}

/**
 * Aviso antes de volver a matricular a quien ya se certificó: empieza de cero y el servidor
 * borra su vuelta anterior, así que no puede ocurrir sin que quien matricula lo confirme.
 */
export function restartWarning(names: readonly string[]): string {
  if (names.length === 1) {
    return (
      `${names[0]} ya tiene el certificado de este curso. Si lo matriculas de nuevo, empezará el curso desde ` +
      'cero y se borrarán de forma permanente su avance y sus entregas anteriores, incluidos los archivos que ' +
      'subió. El certificado emitido se conserva.'
    );
  }
  return (
    `Ya tienen el certificado de este curso: ${names.join(', ')}. Si los matriculas de nuevo, empezarán el ` +
    'curso desde cero y se borrarán de forma permanente su avance y sus entregas anteriores, incluidos los ' +
    'archivos que subieron. Los certificados emitidos se conservan.'
  );
}

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

/**
 * Resumen de una matrícula en bloque: cuántos entraron y quiénes no, agrupados por motivo
 * para que un mismo rechazo (el cupo lleno, por ejemplo) no se repita una vez por alumno.
 */
export function batchSummary(
  added: number,
  failures: readonly EnrollmentFailure[],
): { title: string; message: string } {
  const attempted = added + failures.length;
  const title =
    failures.length === 0
      ? `${added} ${added === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'}`
      : added === 0
        ? 'No se pudo matricular a ningún estudiante'
        : `Se matriculó a ${added} de ${attempted} estudiantes`;

  const byReason = new Map<string, string[]>();
  for (const { name, reason } of failures) byReason.set(reason, [...(byReason.get(reason) ?? []), name]);
  const message = [...byReason].map(([reason, names]) => `${nameList(names)}: ${reason}`).join(' ');

  return { title, message };
}

/** Cursos que casan con la búsqueda por título y con el filtro de asignación. */
export function filterCourses(
  courses: readonly AssignableCourse[],
  search: string,
  filter: AssignmentFilter,
): AssignableCourse[] {
  const text = search.trim().toLowerCase();
  return courses.filter((course) => {
    if (text && !course.title.toLowerCase().includes(text)) return false;
    if (filter === 'assigned') return hasExaminer(course);
    if (filter === 'unassigned') return !hasExaminer(course);
    return true;
  });
}
