import type { CourseStatus, UserRole, User } from '@/types/models';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { plural } from '@/lib/text';

/**
 * Tipos y vocabulario que comparten las piezas de la pantalla de cuentas.
 */

/** Las tres pestañas de la pantalla coinciden con los tres roles. */
export type Tab = UserRole;

export interface AssignedCourse {
  guid: string;
  title: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt?: string;
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

/**
 * Nombre y colores de cada rol: `text` tiñe la etiqueta y `background` el avatar de quien
 * no tiene foto.
 */
export const ROLE_DISPLAY: Record<UserRole, { label: string; text: string; background: string }> = {
  ADMIN: { label: USER_ROLE_LABEL.ADMIN, text: 'text-red-700 dark:text-red-400', background: 'bg-red-500' },
  TEACHER: { label: USER_ROLE_LABEL.TEACHER, text: 'text-blue-700 dark:text-blue-400', background: 'bg-blue-500' },
  STUDENT: {
    label: USER_ROLE_LABEL.STUDENT,
    text: 'text-emerald-700 dark:text-emerald-400',
    background: 'bg-emerald-500',
  },
};

/** Quien crea cursos —examinador y administrador— frente a quien los recibe. */
export function managesCourses(role: UserRole): boolean {
  return role === 'TEACHER' || role === 'ADMIN';
}

/** Roles en el orden en que se ofrecen al crear o editar una cuenta. */
export const ROLE_OPTIONS: UserRole[] = ['STUDENT', 'TEACHER', 'ADMIN'];

/**
 * Por qué no se puede pasar una cuenta a un rol, o `null` si se puede.
 *
 * Son las reglas de la API, repetidas aquí para explicarlas antes de enviar: nadie cambia
 * su propio rol, y quien es responsable de cursos sólo puede pasar a otro rol que pueda
 * serlo.
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
    return `Es responsable de ${courses} ${plural(courses, 'curso', 'cursos')}: asígnalos a otro examinador o administrador antes de hacerla ${USER_ROLE_LABEL[role].toLowerCase()}.`;
  }
  return null;
}
