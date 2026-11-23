import type { CourseModule, Resource } from '@/types/models';
import { buildSyllabus } from '@/app/courses/[courseId]/components/progression';
import { dayKey, nextSteps, previousMonth, studyIntensity, studyStreak, weekOf } from './today';

function resource(guid: string, type: Resource['type'] = 'TEXT'): Resource {
  return { guid, title: guid, type, moduleGuid: 'm' } as Resource;
}

function modules(...lists: string[][]): CourseModule[] {
  return lists.map((guids, index) => ({
    guid: `m${index}`,
    courseGuid: 'c',
    title: `Módulo ${index + 1}`,
    position: index,
    resources: guids.map((guid) => resource(guid)),
  }));
}

const progress = (completed: string[], awaitingGrade: string[] = []) => ({
  completed: new Set(completed),
  awaitingGrade: new Set(awaitingGrade),
});

describe('nextSteps', () => {
  it('con orden estricto: el que toca y los siguientes, cerrados', () => {
    const syllabus = buildSyllabus(modules(['a', 'b'], ['c', 'd']), progress(['a']), true);

    expect(nextSteps(syllabus).map((step) => [step.resource.guid, step.state, step.moduleTitle])).toEqual([
      ['b', 'now', 'Módulo 1'],
      ['c', 'locked', 'Módulo 2'],
      ['d', 'locked', 'Módulo 2'],
    ]);
  });

  it('una tarea que espera nota no es «la que toca»', () => {
    const syllabus = buildSyllabus(modules(['a', 'b', 'c']), progress(['a'], ['b']), true);
    const steps = nextSteps(syllabus);

    expect(steps[0]).toMatchObject({ state: 'idle', awaitingGrade: true });
    expect(steps[1].state).toBe('locked');
  });

  it('sin orden estricto todo está abierto: sólo el primero es «el que toca»', () => {
    const syllabus = buildSyllabus(modules(['a', 'b', 'c']), progress([]), false);

    expect(nextSteps(syllabus, 2).map((step) => step.state)).toEqual(['now', 'idle']);
  });

  it('un curso terminado no tiene pasos', () => {
    expect(nextSteps(buildSyllabus(modules(['a']), progress(['a']), true))).toEqual([]);
  });
});

describe('semana y racha', () => {
  const saturday = { year: 2026, month: 10, day: 21 };

  it('la semana va de lunes a domingo', () => {
    expect(weekOf(saturday).map(dayKey)).toEqual([
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    // El 1 de noviembre de 2026 es domingo: su semana empezó el lunes 26 de octubre.
    expect(weekOf({ year: 2026, month: 10, day: 1 })[0]).toEqual({ year: 2026, month: 9, day: 26 });
  });

  it('cuenta los días seguidos hasta hoy, o hasta ayer si hoy aún no hay estudio', () => {
    const active = new Set(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);

    expect(studyStreak(active, saturday)).toBe(4);
    expect(studyStreak(active, { year: 2026, month: 10, day: 22 })).toBe(4);
    expect(studyStreak(active, { year: 2026, month: 10, day: 23 })).toBe(0);
  });

  it('la racha cruza el cambio de mes', () => {
    const active = new Set(['2026-9-30', '2026-9-31', '2026-10-1']);

    expect(studyStreak(active, { year: 2026, month: 10, day: 1 })).toBe(3);
    expect(previousMonth({ year: 2026, month: 0, day: 5 })).toEqual({ year: 2025, month: 11 });
  });
});

describe('intensidad de «Tu semana»', () => {
  it('más tiempo de estudio, tono más intenso', () => {
    expect(studyIntensity(0, false)).toBe(0);
    expect(studyIntensity(5, true)).toBe(1);
    expect(studyIntensity(15, true)).toBe(2);
    expect(studyIntensity(44, true)).toBe(2);
    expect(studyIntensity(90, true)).toBe(3);
  });

  it('un día con actividad pero sin tiempo en el visor sigue contando como estudio', () => {
    expect(studyIntensity(0, true)).toBe(1);
  });
});
