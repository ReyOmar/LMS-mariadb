import {
  batchSummary,
  directoryCount,
  filterCourses,
  hasExaminer,
  restartWarning,
  UNENROLL_WARNING,
  type AssignableCourse,
} from './assignment';
import type { UserRole } from '@/types/models';

// Un curso nunca se queda sin responsable: «sin asignar» es estar a cargo de un administrador.
const course = (guid: string, title: string, role: UserRole): AssignableCourse => ({
  guid,
  title,
  status: 'PUBLISHED',
  teacherGuid: `${role}-1`,
  teacher: { guid: `${role}-1`, firstName: 'Ana', lastName: 'Ruiz', role },
});

const courses = [
  course('c1', 'Manejo defensivo', 'TEACHER'),
  course('c2', 'Normativa PESV', 'ADMIN'),
  course('c3', 'Primeros auxilios', 'ADMIN'),
];

describe('hasExaminer', () => {
  it('considera asignado el curso que lleva un examinador', () => {
    expect(hasExaminer(courses[0])).toBe(true);
  });

  it('considera sin asignar el curso que sigue a cargo de un administrador', () => {
    expect(hasExaminer(courses[1])).toBe(false);
  });
});

describe('filterCourses', () => {
  it('sin filtros devuelve todos', () => {
    expect(filterCourses(courses, '', 'all')).toHaveLength(3);
  });

  it('separa los asignados de los que siguen con el administrador', () => {
    expect(filterCourses(courses, '', 'assigned').map((c) => c.guid)).toEqual(['c1']);
    expect(filterCourses(courses, '', 'unassigned').map((c) => c.guid)).toEqual(['c2', 'c3']);
  });

  it('busca por título sin distinguir mayúsculas y combina con el filtro', () => {
    expect(filterCourses(courses, '  NORMATIVA ', 'all').map((c) => c.guid)).toEqual(['c2']);
    expect(filterCourses(courses, 'normativa', 'assigned')).toEqual([]);
  });

  it('busca sin distinguir tildes, como el resto del campus', () => {
    expect(filterCourses(courses, 'primeros auxílios', 'all').map((c) => c.guid)).toEqual(['c3']);
  });
});

describe('restartWarning', () => {
  it('nombra a la persona y advierte de que empieza de cero cuando es una sola', () => {
    const text = restartWarning(['Ana Ruiz']);
    expect(text).toBe(
      'Ana Ruiz ya tiene el certificado de este curso. Si lo matriculas de nuevo, empezará desde cero: su avance ' +
        'se reinicia; sus calificaciones anteriores quedan en el historial (los archivos ya se retiraron al emitir ' +
        'su certificado). El certificado emitido se conserva.',
    );
  });

  it('no promete archivar entregas: sus archivos se retiraron al certificarse', () => {
    expect(restartWarning(['Ana Ruiz'])).not.toMatch(/entregas[^.]*archivan/);
    expect(restartWarning(['Ana Ruiz', 'Beto Gil'])).not.toMatch(/entregas[^.]*archivan/);
  });

  it('lista a todos en un solo aviso cuando son varios', () => {
    const text = restartWarning(['Ana Ruiz', 'Beto Gil']);
    expect(text).toContain('Ya tienen el certificado de este curso: Ana Ruiz, Beto Gil.');
    expect(text).toContain('sus calificaciones anteriores quedan en el historial');
    expect(text).toContain('Los certificados emitidos se conservan.');
  });
});

describe('UNENROLL_WARNING', () => {
  it('avisa de que un cuestionario abierto se cierra como intento gastado', () => {
    expect(UNENROLL_WARNING).toContain('Su avance y sus entregas se conservan');
    expect(UNENROLL_WARNING).toContain('intento cuenta como gastado');
  });
});

describe('directoryCount', () => {
  it('sin nada filtrado dice cuántos cursos hay', () => {
    expect(directoryCount(20, 20)).toBe('20 cursos en total');
    expect(directoryCount(1, 1)).toBe('1 curso en total');
  });

  it('con la búsqueda o el filtro dejando fuera alguno, dice de cuántos', () => {
    expect(directoryCount(1, 20)).toBe('1 de 20 cursos');
  });
});

describe('batchSummary', () => {
  const cupo = 'El curso ha alcanzado su cupo máximo de 2 estudiantes.';

  it('si entran todos, sólo lo cuenta', () => {
    expect(batchSummary(1, [])).toEqual({ title: '1 estudiante matriculado', message: '' });
    expect(batchSummary(3, []).title).toBe('3 estudiantes matriculados');
  });

  it('agrupa los rechazos por motivo para no repetir el mismo una vez por alumno', () => {
    const summary = batchSummary(2, [
      { name: 'Ana Ruiz', reason: cupo },
      { name: 'Beto Gil', reason: 'Este alumno ya está matriculado en el curso.' },
      { name: 'Carla Díaz', reason: cupo },
    ]);

    expect(summary.title).toBe('Se matriculó a 2 de 5 estudiantes');
    expect(summary.message).toBe(
      `Ana Ruiz, Carla Díaz: ${cupo} Beto Gil: Este alumno ya está matriculado en el curso.`,
    );
  });

  it('con muchos rechazados por lo mismo cita a unos pocos y cuenta el resto', () => {
    const failures = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name, reason: cupo }));

    const summary = batchSummary(0, failures);

    expect(summary.title).toBe('No se pudo matricular a ningún estudiante');
    expect(summary.message).toBe(`A, B, C, D, E y 2 más: ${cupo}`);
  });
});
