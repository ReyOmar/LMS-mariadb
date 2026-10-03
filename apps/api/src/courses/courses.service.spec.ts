import { CoursesService } from './courses.service';
import { sessionFor } from '../common/testing/test-campus';

const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');
const DRAFT = { guid: 'curso-1', country: 'COLOMBIA', title: 'Curso', status: 'DRAFT', teacherGuid: 'admin' };

function serviceWith(prisma: Record<string, unknown>) {
  const deletedFiles: (string | null | undefined)[] = [];
  const storage = {
    deleteFiles: async (keys: (string | null | undefined)[]) => {
      deletedFiles.push(...keys);
    },
  };
  const access = { managedCourse: async () => DRAFT };
  const realtime = { emitToCountry: () => undefined, emitToUsers: () => undefined };
  const service = new CoursesService(
    prisma as never,
    access as never,
    storage as never,
    {} as never,
    realtime as never,
  );
  return { service, deletedFiles: () => deletedFiles.filter(Boolean) };
}

/** Lo que deja de usarse al tocar un curso tiene que salir también del almacenamiento. */
describe('CoursesService · archivos del curso', () => {
  it('borrar un curso retira portada, material, adjuntos y entregas', async () => {
    const { service, deletedFiles } = serviceWith({
      course: {
        findUnique: async () => ({ coverImage: 'portadas/curso.jpg' }),
        delete: async () => undefined,
      },
      resource: {
        findMany: async () => [
          { attachmentKey: 'recursos/guia.pdf', fileUrl: 'recursos/video.mp4' },
          { attachmentKey: null, fileUrl: 'recursos/lectura.pdf' },
        ],
      },
      submission: { findMany: async () => [{ attachmentKey: 'entregas/informe.pdf' }] },
    });

    await service.deleteCourse('curso-1', ADMIN);

    expect(deletedFiles()).toEqual([
      'portadas/curso.jpg',
      'recursos/guia.pdf',
      'recursos/video.mp4',
      'recursos/lectura.pdf',
      'entregas/informe.pdf',
    ]);
  });

  it('cambiar la portada borra la anterior', async () => {
    const { service, deletedFiles } = serviceWith({
      course: {
        findUnique: async () => ({ coverImage: 'portadas/vieja.jpg' }),
        update: async () => ({ guid: 'curso-1', title: 'Curso', status: 'DRAFT', coverImage: 'portadas/nueva.jpg' }),
      },
    });

    await service.updateCourse('curso-1', { coverImage: 'portadas/nueva.jpg' }, ADMIN);

    expect(deletedFiles()).toEqual(['portadas/vieja.jpg']);
  });

  it('guardar la ficha sin tocar la portada no borra nada', async () => {
    const { service, deletedFiles } = serviceWith({
      course: {
        update: async () => ({ guid: 'curso-1', title: 'Otro título', status: 'DRAFT', coverImage: 'portadas/c.jpg' }),
      },
    });

    await service.updateCourse('curso-1', { title: 'Otro título' }, ADMIN);

    expect(deletedFiles()).toEqual([]);
  });
});

describe('CoursesService · cursos del alumno', () => {
  it('sólo lista los cursos con matrícula activa', async () => {
    const queries: { where: unknown }[] = [];
    const { service } = serviceWith({
      enrollment: {
        findMany: async (query: { where: unknown }) => {
          queries.push(query);
          return [];
        },
      },
    });

    await service.getCurrentUserCourses(sessionFor('STUDENT', 'COLOMBIA', 'alumna'));

    expect(queries[0].where).toEqual({ userGuid: 'alumna', active: true });
  });
});
