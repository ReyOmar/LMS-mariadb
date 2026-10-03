import { roleChangeProblem } from './accounts';

/**
 * Qué cambios de rol ofrece la ficha de una cuenta. Son las reglas de la API; aquí se
 * comprueba que la pantalla no ofrezca lo que el servidor va a rechazar.
 */
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
