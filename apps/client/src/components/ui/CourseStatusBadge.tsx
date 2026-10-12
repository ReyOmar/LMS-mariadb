import { COURSE_STATUS_LABEL } from '@/lib/labels';
import type { CourseStatus } from '@/types/models';

const STATUS_STYLE: Record<CourseStatus, string> = {
  PUBLISHED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  DRAFT: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

/** Estado del curso con el mismo color en todas las pantallas; `className` fija el tamaño. */
export function CourseStatusBadge({ status, className = '' }: { status: CourseStatus; className?: string }) {
  return <span className={`font-bold ${STATUS_STYLE[status]} ${className}`}>{COURSE_STATUS_LABEL[status]}</span>;
}
