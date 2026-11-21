import type { Course } from '@/types/models';

/**
 * Un curso está terminado cuando lo está su vuelta actual: el certificado de una vuelta
 * anterior no cuenta para quien lo está repitiendo.
 */
const finished = (course: Course) => Boolean(course.completedAt);

/** Lo que el tablero cuenta de los cursos del alumno. */
export interface CourseSummary {
  /** Cursos que se pueden hacer ahora: publicados, sin mantenimiento y sin terminar. */
  active: Course[];
  /** Cursos asignados que ahora mismo están en mantenimiento y aún sin completar. */
  underMaintenance: Course[];
  /** El que se le propone seguir: el primero de los activos. */
  current: Course | null;
  /** Tiene cursos y los terminó todos. */
  allCompleted: boolean;
  /** Avance del curso propuesto. */
  progress: { completed: number; total: number; percent: number };
}

export function summarizeCourses(courses: Course[]): CourseSummary {
  const active = courses.filter((course) => course.status === 'PUBLISHED' && !finished(course));
  const current = active[0] ?? null;
  return {
    active,
    underMaintenance: courses.filter((course) => course.status === 'DRAFT' && !finished(course)),
    current,
    allCompleted: courses.length > 0 && courses.every(finished),
    progress: {
      completed: current?.completedResources ?? 0,
      total: current?.totalResources ?? 0,
      percent: current?.percent ?? 0,
    },
  };
}

/** Lo que explica la cifra de cursos activos cuando es cero o hay alguno parado. */
export function activeCoursesDetail(
  summary: CourseSummary,
  assigned: number,
): { text: string; tone?: 'success' | 'warning' } | undefined {
  if (summary.underMaintenance.length > 0) {
    return { text: `${summary.underMaintenance.length} en mantenimiento`, tone: 'warning' };
  }
  if (summary.allCompleted) return { text: 'Todos completados', tone: 'success' };
  if (assigned === 0) return { text: 'Sin cursos asignados' };
  return undefined;
}
