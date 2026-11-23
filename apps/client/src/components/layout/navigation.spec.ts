import { NAVIGATION, PHONE_TABS, isActiveLink, isWithin, pageNameOf, phoneMoreSections } from './navigation';

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

  it('el inicio es «Hoy» para todos los roles', () => {
    expect(pageNameOf('/dashboard', 'student')).toBe('Hoy');
    expect(pageNameOf('/dashboard', 'teacher')).toBe('Hoy');
    expect(pageNameOf('/dashboard', 'admin')).toBe('Hoy');
    expect(pageNameOf('/dashboard/examiner/courses', 'teacher')).toBe('Mis asignaciones');
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

describe('isActiveLink', () => {
  const [today, assignments] = NAVIGATION.teacher.tabs;

  it('el inicio sólo se marca en el propio inicio', () => {
    expect(isActiveLink(today, '/dashboard')).toBe(true);
    expect(isActiveLink(today, '/dashboard/messages')).toBe(false);
  });

  it('una sección se marca en sus pantallas interiores y en las que incluye', () => {
    expect(isActiveLink(assignments, '/dashboard/examiner/courses')).toBe(true);
    expect(isActiveLink(assignments, '/dashboard/course-builder')).toBe(true);
    expect(isActiveLink(assignments, '/dashboard/examiner/coursesx')).toBe(false);
  });
});

describe('«Más»', () => {
  it('se marca cuando la pantalla abierta es una de las suyas', () => {
    expect(isWithin(NAVIGATION.admin.more, '/dashboard/admin/theme')).toBe(true);
    expect(isWithin(NAVIGATION.admin.more, '/dashboard/admin/users')).toBe(false);
  });

  it('en el teléfono recoge las pestañas que no caben en la barra inferior', () => {
    const sections = phoneMoreSections('admin');

    expect(sections[0].links).toEqual(NAVIGATION.admin.tabs.slice(PHONE_TABS));
    expect(sections.slice(1)).toEqual(NAVIGATION.admin.more);
  });

  it('el estudiante no lo necesita: todo cabe en la barra', () => {
    expect(NAVIGATION.student.tabs.length).toBeLessThanOrEqual(PHONE_TABS);
    expect(phoneMoreSections('student')).toEqual([]);
  });
});
