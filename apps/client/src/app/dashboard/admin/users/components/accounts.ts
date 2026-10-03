import type { CourseStatus, UserRole, User } from '@/types/models';
import { USER_ROLE_LABEL } from '@/lib/labels';

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
