import { pageNameOf } from './navigation';

/**
 * El título de la pestaña dice en qué pantalla se está. Con el mismo título en todas, quien tiene
 * dos pestañas del campus abiertas —o mira su historial— no sabe cuál es cuál.
 */
describe('pageNameOf', () => {
  it('nombra cada pantalla como su enlace del menú', () => {
    expect(pageNameOf('/dashboard/admin/users', 'admin')).toBe('Usuarios');
    expect(pageNameOf('/dashboard/student/certificates', 'student')).toBe('Mis certificados');
    expect(pageNameOf('/dashboard/examiner/grading', 'teacher')).toBe('Calificación de entregas');
  });

  it('el inicio se llama como lo ve cada rol', () => {
    expect(pageNameOf('/dashboard', 'student')).toBe('Mi tablero');
    expect(pageNameOf('/dashboard', 'teacher')).toBe('Mis asignaciones');
    expect(pageNameOf('/dashboard', 'admin')).toBe('Panel de la sede');
  });

  it('una pantalla interior lleva el nombre de la que la contiene', () => {
    const editor = '/dashboard/course-builder/c1/modules/m1/resources/r1';

    expect(pageNameOf(editor, 'admin')).toBe('Gestión de cursos');
    expect(pageNameOf('/courses/c1', 'student')).toBe('Curso');
  });

  it('una pantalla que no está en el menú de quien mira toma el nombre del menú de otro rol', () => {
    expect(pageNameOf('/dashboard/examiner/quizzes', 'admin')).toBe('Monitoreo de pruebas');
    expect(pageNameOf('/dashboard/course-builder', 'teacher')).toBe('Gestión de cursos');
  });

  it('las páginas públicas tienen el suyo', () => {
    expect(pageNameOf('/login', 'student')).toBe('Acceso al campus');
    expect(pageNameOf('/verify', 'student')).toBe('Verificar un certificado');
  });

  it('la portada y las rutas que no existen sólo llevan la marca', () => {
    expect(pageNameOf('/', 'student')).toBeNull();
    expect(pageNameOf('/esta-pagina-no-existe', 'admin')).toBeNull();
    expect(pageNameOf('/dashboardx', 'admin')).toBeNull();
  });
});
