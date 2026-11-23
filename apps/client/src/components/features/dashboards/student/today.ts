import type { CourseModule, Resource } from '@/types/models';
import type { SyllabusModule } from '@/app/courses/[courseId]/components/progression';
import type { AgendaState } from '../agenda/AgendaParts';

/** Un paso de «Para hoy»: un recurso pendiente del curso que se está haciendo. */
export interface NextStep {
  resource: Resource;
  moduleTitle: string;
  state: Extract<AgendaState, 'now' | 'idle' | 'locked'>;
  /** Tarea ya entregada que espera la nota del examinador. */
  awaitingGrade: boolean;
}

/**
 * Los próximos pasos del curso: el que toca y los que vienen detrás, hasta `limit`. «El que toca» es
 * el primero abierto que no espera nota; lo que el orden estricto aún no abre sale cerrado.
 */
export function nextSteps(syllabus: SyllabusModule<CourseModule>[], limit = 3): NextStep[] {
  const pending = syllabus.flatMap((item) =>
    item.entries.filter((entry) => !entry.completed).map((entry) => ({ entry, moduleTitle: item.module.title })),
  );

  let current = false;
  return pending.slice(0, limit).map(({ entry, moduleTitle }) => {
    let state: NextStep['state'] = 'idle';
    if (!entry.open) state = 'locked';
    else if (!current && !entry.awaitingGrade) {
      state = 'now';
      current = true;
    }
    return { resource: entry.resource as Resource, moduleTitle, state, awaitingGrade: entry.awaitingGrade };
  });
}

/** Día del calendario de la sede. El mes empieza en 0, como en `Date`. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function shift({ year, month, day }: CalendarDay, days: number): CalendarDay {
  const date = new Date(Date.UTC(year, month, day) + days * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

export function dayKey({ year, month, day }: CalendarDay): string {
  return `${year}-${month}-${day}`;
}

/** Los siete días de la semana de `today`, de lunes a domingo. */
export function weekOf(today: CalendarDay): CalendarDay[] {
  const weekday = new Date(Date.UTC(today.year, today.month, today.day)).getUTCDay();
  const monday = shift(today, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shift(monday, index));
}

/**
 * Días seguidos con estudio hasta hoy. Si hoy aún no se ha estudiado, la racha sigue viva y se
 * cuenta hasta ayer: no se pierde por mirar el tablero a primera hora.
 */
export function studyStreak(active: ReadonlySet<string>, today: CalendarDay, maxDays = 62): number {
  let day = active.has(dayKey(today)) ? today : shift(today, -1);
  let streak = 0;
  while (streak < maxDays && active.has(dayKey(day))) {
    streak += 1;
    day = shift(day, -1);
  }
  return streak;
}

/** El mes anterior al de `day`: hace falta para la semana y la racha que empiezan en él. */
export function previousMonth({ year, month }: CalendarDay): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/** Tono de un día en «Tu semana»: 0 sin estudio; de 1 a 3, cuanto más tiempo, más intenso. */
export type StudyIntensity = 0 | 1 | 2 | 3;

/**
 * Intensidad de un día según sus minutos en el visor. Un día con actividad pero sin minutos
 * (completó o entregó algo desde otro sitio) cuenta como estudio, en el tono más suave.
 */
export function studyIntensity(minutes: number, studied: boolean): StudyIntensity {
  if (minutes >= 45) return 3;
  if (minutes >= 15) return 2;
  if (minutes > 0 || studied) return 1;
  return 0;
}
