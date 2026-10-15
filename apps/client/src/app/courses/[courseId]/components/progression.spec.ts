import {
  buildSyllabus,
  findEntry,
  isOnlyAwaitingGrades,
  isPathCompleted,
  moduleStart,
  pathProgressFrom,
  resumeEntry,
  type PathProgress,
} from './progression';

/**
 * Si el cálculo se equivoca en un sentido, un alumno se queda encallado sin motivo; si lo hace
 * en el otro, termina un curso sin haber visto el material. Las dos direcciones se comprueban.
 */

/** Curso de dos módulos con dos recursos cada uno. */
const COURSE = [
  { guid: 'm1', resources: [{ guid: 'r1' }, { guid: 'r2' }] },
  { guid: 'm2', resources: [{ guid: 'r3' }, { guid: 'r4' }] },
];

function progress(completed: string[], awaitingGrade: string[] = []): PathProgress {
  return { completed: new Set(completed), awaitingGrade: new Set(awaitingGrade) };
}

function openGuids(modules: typeof COURSE, done: string[], strictOrder = true): string[] {
  return buildSyllabus(modules, progress(done), strictOrder)
    .flatMap((item) => item.entries)
    .filter((entry) => entry.open)
    .map((entry) => entry.resource.guid);
}

describe('pathProgressFrom', () => {
  it('cuenta lo desbloqueado por espera como completado sin dejar de esperar nota', () => {
    const path = pathProgressFrom({
      completed: ['r1'],
      unlockedByWait: ['r2'],
      pendingAssignments: [{ resourceGuid: 'r2', title: 'Tarea', submittedAt: null }],
    });
    expect([...path.completed]).toEqual(['r1', 'r2']);
    expect([...path.awaitingGrade]).toEqual(['r2']);
  });
});

describe('buildSyllabus con orden estricto', () => {
  it('sólo el primer recurso está abierto al empezar', () => {
    expect(openGuids(COURSE, [])).toEqual(['r1']);
  });

  it('cada recurso espera a los anteriores de su módulo', () => {
    expect(openGuids(COURSE, ['r1'])).toEqual(['r1', 'r2']);
  });

  it('un módulo espera a que el anterior esté entero', () => {
    const syllabus = buildSyllabus(COURSE, progress(['r1']), true);
    expect(syllabus.map((item) => item.open)).toEqual([true, false]);
    expect(openGuids(COURSE, ['r1', 'r2'])).toEqual(['r1', 'r2', 'r3']);
  });

  it('completar por delante no abre lo de atrás', () => {
    expect(openGuids(COURSE, ['r4'])).toEqual(['r1']);
  });

  it('un módulo vacío al principio no bloquea a los siguientes', () => {
    const withEmptyFirst = [{ guid: 'm0', resources: [] }, ...COURSE];
    expect(openGuids(withEmptyFirst, [])).toEqual(['r1']);
  });

  it('un módulo vacío en medio no sirve para saltarse el anterior', () => {
    const withEmptyMiddle = [COURSE[0], { guid: 'vacío', resources: [] }, COURSE[1]];
    expect(openGuids(withEmptyMiddle, [])).toEqual(['r1']);
    expect(buildSyllabus(withEmptyMiddle, progress([]), true)[2].open).toBe(false);
  });

  it('marca lo completado, lo que espera nota y los módulos terminados', () => {
    const [first, second] = buildSyllabus(COURSE, progress(['r1', 'r2', 'r3'], ['r3']), true);
    expect(first.finished).toBe(true);
    expect(second.finished).toBe(false);
    expect(second.entries[0]).toMatchObject({ completed: true, awaitingGrade: true });
  });
});

describe('buildSyllabus sin orden estricto', () => {
  it('todo está abierto desde el principio', () => {
    expect(openGuids(COURSE, [], false)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(buildSyllabus(COURSE, progress([]), false).every((item) => item.open)).toBe(true);
  });
});

describe('resumeEntry', () => {
  const resume = (done: string[]) => resumeEntry(buildSyllabus(COURSE, progress(done), true))?.resource.guid;

  it('lleva al primer recurso sin completar, aunque haya huecos por delante', () => {
    expect(resume([])).toBe('r1');
    expect(resume(['r1', 'r2'])).toBe('r3');
    expect(resume(['r2', 'r3'])).toBe('r1');
  });

  it('con todo completado lleva al último, para repasar', () => {
    expect(resume(['r1', 'r2', 'r3', 'r4'])).toBe('r4');
  });

  it('un curso sin contenido no lleva a ninguna parte', () => {
    expect(resumeEntry(buildSyllabus([], progress([]), true))).toBeNull();
    expect(resumeEntry(buildSyllabus([{ guid: 'm1', resources: [] }], progress([]), true))).toBeNull();
  });
});

describe('findEntry y moduleStart', () => {
  const syllabus = buildSyllabus(COURSE, progress(['r1', 'r2']), true);

  it('encuentra un recurso del curso y no uno ajeno', () => {
    expect(findEntry(syllabus, 'r3')?.open).toBe(true);
    expect(findEntry(syllabus, 'otro')).toBeNull();
    expect(findEntry(syllabus, null)).toBeNull();
  });

  it('el principio del módulo es su primer recurso', () => {
    expect(moduleStart(syllabus, 'r4')?.guid).toBe('r3');
    expect(moduleStart(syllabus, 'otro')).toBeNull();
  });
});

describe('fin del recorrido', () => {
  const syllabusWith = (done: string[], awaiting: string[] = []) =>
    buildSyllabus(COURSE, progress(done, awaiting), true);

  it('está completo cuando todo está hecho y nada espera nota', () => {
    expect(isPathCompleted(syllabusWith(['r1', 'r2', 'r3', 'r4']))).toBe(true);
    expect(isPathCompleted(syllabusWith(['r1', 'r2', 'r3']))).toBe(false);
  });

  it('lo desbloqueado por espera no da el curso por completo', () => {
    expect(isPathCompleted(syllabusWith(['r1', 'r2', 'r3', 'r4'], ['r4']))).toBe(false);
  });

  it('un curso vacío no se da por completo', () => {
    expect(isPathCompleted(buildSyllabus([], progress([]), true))).toBe(false);
  });

  it('sólo falta la nota cuando lo que no está completado está entregado', () => {
    expect(isOnlyAwaitingGrades(syllabusWith(['r1', 'r2', 'r3'], ['r4']))).toBe(true);
    expect(isOnlyAwaitingGrades(syllabusWith(['r1', 'r2'], ['r4']))).toBe(false);
    expect(isOnlyAwaitingGrades(syllabusWith(['r1', 'r2', 'r3', 'r4']))).toBe(false);
  });
});
