import type { CourseStatus, UserRole } from '@/types/models';

/** Nombre de cada estado de un curso tal como lo ve el usuario. */
export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

/** Nombre de cada rol tal como lo ve el usuario. */
export const USER_ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Examinador',
  STUDENT: 'Estudiante',
};
