import {
  courseDate,
  coursesHeading,
  deleteAccountWarning,
  emptyCoursesLink,
  roleChangeProblem,
  type AssignedCourse,
} from './accounts';

describe('roleChangeProblem', () => {
  it('dejar el rol como está nunca es un problema', () => {
    expect(roleChangeProblem({ role: 'ADMIN' }, 'ADMIN', true)).toBeNull();
  });

  it('nadie puede cambiar su propio rol', () => {
    expect(roleChangeProblem({ role: 'ADMIN' }, 'TEACHER', true)).toMatch(/propio rol/);
  });

  it('quien tiene cursos a su cargo no pasa a estudiante', () => {
    expect(roleChangeProblem({ role: 'TEACHER', taughtCourses: 2 }, 'STUDENT', false)).toMatch(/2 cursos/);
  });

  it('pero sí a administrador, que también puede tenerlos', () => {
    expect(roleChangeProblem({ role: 'TEACHER', taughtCourses: 2 }, 'ADMIN', false)).toBeNull();
  });

  it('sin cursos a su cargo, cualquier cambio vale', () => {
    expect(roleChangeProblem({ role: 'TEACHER', taughtCourses: 0 }, 'STUDENT', false)).toBeNull();
    expect(roleChangeProblem({ role: 'STUDENT' }, 'ADMIN', false)).toBeNull();
  });
});

describe('ficha de una cuenta', () => {
  const course: AssignedCourse = {
    guid: 'c1',
    title: 'Manejo defensivo',
    status: 'PUBLISHED',
    createdAt: '2026-01-10T00:00:00.000Z',
  };

  it('de un estudiante enseña la fecha de matrícula', () => {
    expect(courseDate('STUDENT', { ...course, assignedAt: '2026-03-02T00:00:00.000Z' })).toEqual({
      label: 'Matriculado',
      date: '2026-03-02T00:00:00.000Z',
    });
  });

  it('de quien tiene cursos a su cargo enseña la creación del curso, no su última edición', () => {
    expect(courseDate('TEACHER', course)).toEqual({ label: 'Creado', date: '2026-01-10T00:00:00.000Z' });
    expect(courseDate('ADMIN', course)).toEqual({ label: 'Creado', date: '2026-01-10T00:00:00.000Z' });
  });

  it('llama «a su cargo» a los cursos de examinadores y administradores', () => {
    expect(coursesHeading('TEACHER')).toBe('Cursos a su cargo');
    expect(coursesHeading('ADMIN')).toBe('Cursos a su cargo');
    expect(coursesHeading('STUDENT')).toBe('Cursos matriculados');
  });

  it('a un examinador sin cursos lo lleva a la asignación, que es donde se le asignan', () => {
    expect(emptyCoursesLink('TEACHER')?.href).toBe('/dashboard/admin/course-assignment');
    expect(emptyCoursesLink('ADMIN')?.href).toBe('/dashboard/course-builder');
    expect(emptyCoursesLink('STUDENT')).toBeNull();
  });
});

describe('deleteAccountWarning', () => {
  it('a un estudiante le avisa de que pierde su avance pero no sus certificados', () => {
    const warning = deleteAccountWarning('STUDENT');
    expect(warning).toContain('Se borrarán su progreso, sus entregas y sus mensajes.');
    expect(warning).toContain('Los certificados ya emitidos se conservan');
    expect(warning).not.toMatch(/borrarán[^.]*certificados/);
  });

  it('a examinadores y administradores no les habla de progreso ni de entregas', () => {
    for (const role of ['TEACHER', 'ADMIN'] as const) {
      const warning = deleteAccountWarning(role);
      expect(warning).not.toMatch(/progreso|entregas/);
      expect(warning).toContain('su firma');
      expect(warning).toContain('Los certificados ya emitidos se conservan');
    }
  });
});
