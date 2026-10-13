import { staysInCourse } from './exit';
import { builderUrl, newResourceEditorUrl, resourceEditorUrl } from './paths';

describe('staysInCourse', () => {
  const course = 'c-1';

  it('moverse por el temario del mismo curso no es salir', () => {
    expect(staysInCourse('/dashboard/course-builder?course=c-1', course)).toBe(true);
    expect(staysInCourse(builderUrl('c-1', { moduleGuid: 'm-1', resourceGuid: 'r-1' }), course)).toBe(true);
    expect(staysInCourse('/dashboard/course-builder/?course=c-1#ajustes', course)).toBe(true);
  });

  it('abrir el editor de un recurso del mismo curso, también de uno nuevo, no es salir', () => {
    expect(staysInCourse(resourceEditorUrl('c-1', 'm-1', 'r-1'), course)).toBe(true);
    expect(staysInCourse(newResourceEditorUrl('c-1', 'm-1', 'QUIZ'), course)).toBe(true);
  });

  it('el constructor sin curso, como el enlace «Gestión de cursos» del menú, cierra el curso', () => {
    expect(staysInCourse('/dashboard/course-builder', course)).toBe(false);
    expect(staysInCourse('/dashboard/course-builder/', course)).toBe(false);
    expect(staysInCourse('/dashboard/course-builder#cursos', course)).toBe(false);
  });

  it('abrir otro curso, o un recurso suyo, también cierra éste aunque su identificador empiece igual', () => {
    expect(staysInCourse('/dashboard/course-builder?course=c-2', course)).toBe(false);
    expect(staysInCourse('/dashboard/course-builder?course=c-10', course)).toBe(false);
    expect(staysInCourse('/dashboard/course-builder/c-2/modules/m-1/resources/r-1', course)).toBe(false);
    expect(staysInCourse('/dashboard/course-builder/c-10/modules/m-1/resources/r-1', course)).toBe(false);
  });

  it('otra pantalla es salir aunque mencione el constructor o el curso en la dirección', () => {
    expect(staysInCourse('/dashboard/admin/course-assignment?course=c-1', course)).toBe(false);
    expect(staysInCourse('/courses/c-1', course)).toBe(false);
    expect(staysInCourse('/login?next=/dashboard/course-builder?course=c-1', course)).toBe(false);
  });

  it('descargar un archivo no es salir', () => {
    expect(staysInCourse('/api/storage/download/adjuntos/temario.pdf', course)).toBe(true);
    expect(staysInCourse('/dashboard?file=/storage/download/adjuntos/temario.pdf', course)).toBe(false);
  });
});
