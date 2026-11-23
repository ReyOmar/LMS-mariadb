import type { Course } from '@/types/models';
import { summarizeCourses } from './courses';

function course(guid: string, status: Course['status'], completedAt: string | null = null, percent = 0): Course {
  return {
    guid,
    title: guid,
    status,
    completedAt,
    percent,
    completedResources: percent / 10,
    totalResources: 10,
  } as Course;
}

describe('summarizeCourses', () => {
  it('propone el primer curso publicado que no ha terminado', () => {
    const summary = summarizeCourses([course('hecho', 'PUBLISHED', '2026-10-01'), course('a', 'PUBLISHED', null, 40)]);

    expect(summary.current?.guid).toBe('a');
    expect(summary.progress).toEqual({ completed: 4, total: 10, percent: 40 });
  });

  it('un curso en mantenimiento no se puede hacer ahora, pero sigue pendiente', () => {
    const summary = summarizeCourses([course('parado', 'DRAFT')]);

    expect(summary.current).toBeNull();
    expect(summary.underMaintenance.map((item) => item.guid)).toEqual(['parado']);
    expect(summary.allCompleted).toBe(false);
  });

  it('todo terminado sólo si tiene algún curso', () => {
    expect(summarizeCourses([course('hecho', 'PUBLISHED', '2026-10-01')]).allCompleted).toBe(true);
    expect(summarizeCourses([]).allCompleted).toBe(false);
  });
});
