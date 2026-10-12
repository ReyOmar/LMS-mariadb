import type { UserRole } from '@/types/models';

interface RoleStyle {
  /** Texto e iconos en el color del rol, legible en los dos temas. */
  text: string;
  /** Insignias y avatares sobre un fondo suave del color del rol. */
  tint: string;
  /** Avatares rellenos del color del rol, con las iniciales en blanco. */
  solid: string;
}

/** Cada rol se reconoce por el mismo color en todo el campus. */
export const ROLE_STYLE: Record<UserRole, RoleStyle> = {
  ADMIN: {
    text: 'text-red-700 dark:text-red-400',
    tint: 'bg-red-500/10 text-red-700 dark:text-red-400',
    solid: 'bg-red-500',
  },
  TEACHER: {
    text: 'text-blue-700 dark:text-blue-400',
    tint: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    solid: 'bg-blue-500',
  },
  STUDENT: {
    text: 'text-emerald-700 dark:text-emerald-400',
    tint: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    solid: 'bg-emerald-500',
  },
};
