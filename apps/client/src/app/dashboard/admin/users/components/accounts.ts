import type { CourseStatus, UserRole, User } from '@/types/models';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { plural } from '@/lib/text';

export interface AssignedCourse {
  guid: string;
  title: string;
  status: CourseStatus;
  createdAt: string;
  /** Fecha de matrícula; sólo llega en los cursos de un estudiante. */
  assignedAt?: string;
}

/** Candidato a heredar los cursos de una cuenta que se elimina. */
export interface TransferTarget {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}

export interface TransferState {
  user: User;
  targets: TransferTarget[];
  selectedTarget: string;
  loading: boolean;
}

/** Quien puede ser responsable de cursos: examinador o administrador. */
export function managesCourses(role: UserRole): boolean {
  return role === 'TEACHER' || role === 'ADMIN';
}

/** Roles en el orden en que se ofrecen al crear o editar una cuenta. */
export const ROLE_OPTIONS: UserRole[] = ['STUDENT', 'TEACHER', 'ADMIN'];

/**
 * Por qué no se puede pasar una cuenta a un rol, o `null` si se puede. Son las reglas de la
 * API, para explicarlas antes de enviar.
 */
export function roleChangeProblem(
  account: Pick<User, 'role' | 'taughtCourses'>,
  role: UserRole,
  isSelf: boolean,
): string | null {
  if (role === account.role) return null;
  if (isSelf) return 'No puedes cambiar tu propio rol: pídeselo a otro administrador.';

  const courses = account.taughtCourses ?? 0;
  if (courses > 0 && !managesCourses(role)) {
    return `Es responsable de ${courses} ${plural(courses, 'curso', 'cursos')}: ${plural(courses, 'asígnalo', 'asígnalos')} a otro examinador o administrador antes de hacerla ${USER_ROLE_LABEL[role].toLowerCase()}.`;
  }
  return null;
}

export function coursesHeading(role: UserRole): string {
  return managesCourses(role) ? 'Cursos a su cargo' : 'Cursos matriculados';
}

/** La fecha que se enseña de cada curso: la matrícula del estudiante o la creación del curso. */
export function courseDate(role: UserRole, course: AssignedCourse): { label: string; date: string } {
  if (role === 'STUDENT' && course.assignedAt) return { label: 'Matriculado', date: course.assignedAt };
  return { label: 'Creado', date: course.createdAt };
}

/** Adónde ir cuando la cuenta no tiene cursos: a un examinador se le asignan; un administrador los crea. */
export function emptyCoursesLink(role: UserRole): { href: string; label: string } | null {
  if (role === 'TEACHER') return { href: '/dashboard/admin/course-assignment', label: 'Ir a asignar cursos →' };
  if (role === 'ADMIN') return { href: '/dashboard/course-builder', label: 'Ir a gestión de cursos para crear →' };
  return null;
}

/** Lo que se borra con la cuenta según su rol; los certificados emitidos se conservan siempre. */
export function deleteAccountWarning(role: UserRole): string {
  const kept = 'Los certificados ya emitidos se conservan y se siguen verificando. No se puede deshacer.';
  if (role === 'STUDENT') return `Se borrarán su progreso, sus entregas y sus mensajes. ${kept}`;
  return `Perderá el acceso y se borrarán sus mensajes, sus avisos, su foto y su firma. ${kept}`;
}
