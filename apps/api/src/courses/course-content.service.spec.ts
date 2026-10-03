import { CourseContentService } from './course-content.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Contenido de un curso: lo que se guarda al editar un recurso y lo que se borra del
 * almacenamiento al quitar contenido.
 *
 * Con R2 no hay limpieza nocturna de huérfanos, así que un archivo que no se borra al
 * desvincularlo se queda ocupando espacio para siempre.
 */

const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');
const EDITABLE = { guid: 'curso-1', country: 'COLOMBIA', title: 'Curso', status: 'DRAFT', teacherGuid: 'admin' };

function serviceWith(prisma: Record<string, unknown>) {
  const deletedFiles: (string | null | undefined)[] = [];
  const storage = {
    deleteFiles: async (keys: (string | null | undefined)[]) => {
      deletedFiles.push(...keys);
    },
    downloadUrl: (key: string) => `https://archivos/${key}`,
  };
  const access = {
    editableCourse: async () => EDITABLE,
    editableCourseOfModule: async () => EDITABLE,
    editableCourseOfResource: async () => EDITABLE,
  };
  const service = new CourseContentService(prisma as never, access as never, storage as never);
  return { service, deletedFiles: () => deletedFiles.filter(Boolean) };
}

describe('CourseContentService', () => {
  it('borrar un módulo retira del almacenamiento los adjuntos y los archivos principales', async () => {
    const { service, deletedFiles } = serviceWith({
      resource: {
        findMany: async () => [
          { attachmentKey: 'recursos/guia.pdf', fileUrl: null },
          { attachmentKey: null, fileUrl: 'recursos/video.mp4' },
        ],
      },
      courseModule: { delete: async () => undefined },
    });

    await service.deleteModule('modulo-1', ADMIN);

    expect(deletedFiles()).toEqual(['recursos/guia.pdf', 'recursos/video.mp4']);
  });

  it('quitar el cuestionario con una cadena vacía guarda nulo y no un cuestionario roto', async () => {
    let saved: Record<string, unknown> = {};
    const { service } = serviceWith({
      resource: {
        findUnique: async () => ({ attachmentKey: null, fileUrl: null }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          saved = data;
          return { guid: 'r1', attachmentKey: null, fileUrl: null, quizConfig: null };
        },
      },
    });

    await service.updateResource('r1', { quizConfig: '' }, ADMIN);

    expect(saved.quizConfig).toBeNull();
  });

  it('sustituir el adjunto borra el anterior', async () => {
    const { service, deletedFiles } = serviceWith({
      resource: {
        findUnique: async () => ({ attachmentKey: 'recursos/viejo.pdf', fileUrl: null }),
        update: async () => ({ guid: 'r1', attachmentKey: 'recursos/nuevo.pdf', fileUrl: null, quizConfig: null }),
      },
    });

    await service.updateResource('r1', { attachmentKey: 'recursos/nuevo.pdf' }, ADMIN);

    expect(deletedFiles()).toEqual(['recursos/viejo.pdf']);
  });

  it('reordenar ignora identificadores ajenos y repetidos', async () => {
    const updates: { guid: string; position: number }[] = [];
    const { service } = serviceWith({
      courseModule: {
        findMany: async () => [{ guid: 'm1' }, { guid: 'm2' }],
        update: ({ where, data }: { where: { guid: string }; data: { position: number } }) => {
          updates.push({ guid: where.guid, position: data.position });
          return Promise.resolve();
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    });

    await service.reorderModules('curso-1', ['m2', 'modulo-de-otro-curso', 'm2', 'm1'], ADMIN);

    expect(updates).toEqual([
      { guid: 'm2', position: 0 },
      { guid: 'm1', position: 1 },
    ]);
  });
});
