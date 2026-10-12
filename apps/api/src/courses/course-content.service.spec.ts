import { ForbiddenException } from '@nestjs/common';
import { CourseContentService } from './course-content.service';
import { sessionFor } from '../common/testing/test-campus';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/**
 * Contenido de un curso: lo que se guarda al editar un recurso y lo que se borra del
 * almacenamiento al quitar contenido. Ninguna tarea periódica recoge archivos sin uso: el que
 * no se borra al desvincularlo se queda ocupando espacio para siempre.
 */

const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');
const EDITABLE = { guid: 'curso-1', country: 'COLOMBIA', title: 'Curso', status: 'DRAFT', teacherGuid: 'admin' };

function serviceWith(prisma: Record<string, unknown>) {
  const storage = { downloadUrl: (key: string) => `https://archivos/${key}` };
  const ownership = fileOwnershipDouble();
  const access = {
    editableCourse: async () => EDITABLE,
    editableCourseOfModule: async () => EDITABLE,
    editableCourseOfResource: async () => EDITABLE,
  };
  const service = new CourseContentService(prisma as never, access as never, storage as never, ownership.files);
  return { service, files: ownership, deletedFiles: ownership.retired };
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
        findUnique: async () => ({ attachmentKey: null }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          saved = data;
          return { guid: 'r1', attachmentKey: null, fileUrl: null, quizConfig: null };
        },
      },
    });

    await service.updateResource('r1', { quizConfig: '' }, ADMIN);

    expect(saved.quizConfig).toBeNull();
  });

  it('sustituir el adjunto comprueba quién subió el nuevo y borra el anterior', async () => {
    const { service, files, deletedFiles } = serviceWith({
      resource: {
        findUnique: async () => ({ attachmentKey: 'recursos/viejo.pdf' }),
        update: async () => ({ guid: 'r1', attachmentKey: 'recursos/nuevo.pdf', fileUrl: null, quizConfig: null }),
      },
    });

    await service.updateResource('r1', { attachmentKey: 'recursos/nuevo.pdf' }, ADMIN);

    expect(files.assertCanUse).toHaveBeenCalledWith('recursos/nuevo.pdf', 'recursos/viejo.pdf', 'recursos', {
      uploader: 'admin',
    });
    expect(deletedFiles()).toEqual(['recursos/viejo.pdf']);
  });

  it('quitar el adjunto lo retira del almacenamiento', async () => {
    const update = jest.fn(async () => ({ guid: 'r1', attachmentKey: null, fileUrl: null, quizConfig: null }));
    const { service, deletedFiles } = serviceWith({
      resource: { findUnique: async () => ({ attachmentKey: 'recursos/viejo.pdf' }), update },
    });

    await service.updateResource('r1', { attachmentKey: null, attachmentName: null }, ADMIN);

    expect(update).toHaveBeenCalledWith({
      where: { guid: 'r1' },
      data: { attachmentKey: null, attachmentName: null },
    });
    expect(deletedFiles()).toEqual(['recursos/viejo.pdf']);
  });

  it('editar el texto sin tocar el adjunto no borra nada', async () => {
    const { service, deletedFiles } = serviceWith({
      resource: {
        findUnique: async () => ({ attachmentKey: 'recursos/viejo.pdf' }),
        update: async () => ({ guid: 'r1', attachmentKey: 'recursos/viejo.pdf', fileUrl: null, quizConfig: null }),
      },
    });

    await service.updateResource('r1', { title: 'Lectura' }, ADMIN);

    expect(deletedFiles()).toEqual([]);
  });

  it('un archivo ajeno no se guarda en el recurso ni se borra el anterior', async () => {
    const update = jest.fn();
    const { service, files, deletedFiles } = serviceWith({
      resource: { findUnique: async () => ({ attachmentKey: 'recursos/viejo.pdf' }), update },
    });
    files.assertCanUse.mockRejectedValueOnce(new ForbiddenException('ajeno'));

    await expect(service.updateResource('r1', { attachmentKey: 'recursos/ajeno.pdf' }, ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(deletedFiles()).toEqual([]);
  });

  describe('la dirección de un enlace', () => {
    function linkService() {
      const update = jest.fn(async () => ({ guid: 'r1', attachmentKey: null, fileUrl: null, quizConfig: null }));
      const { service } = serviceWith({
        resource: { findUnique: async () => ({ type: 'LINK', attachmentKey: null }), update },
      });
      return { service, update };
    }

    it.each(['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'http://intranet:8080/manual'])(
      'acepta %s',
      async (url) => {
        const { service, update } = linkService();

        await service.updateResource('r1', { contentHtml: url }, ADMIN);

        expect(update).toHaveBeenCalled();
      },
    );

    it.each(['no-es-url', 'youtube.com/watch?v=abc', 'javascript:alert(1)'])('rechaza %s', async (url) => {
      const { service, update } = linkService();

      await expect(service.updateResource('r1', { contentHtml: url }, ADMIN)).rejects.toThrow(/URL completa/);
      expect(update).not.toHaveBeenCalled();
    });

    it('se comprueba también al crear el recurso, no sólo al editarlo', async () => {
      const create = jest.fn(async () => ({ guid: 'r1' }));
      const { service } = serviceWith({ resource: { count: async () => 0, create } });

      await expect(
        service.createResource('modulo-1', { type: 'LINK', contentHtml: 'no-es-url' }, ADMIN),
      ).rejects.toThrow(/URL completa/);
      expect(create).not.toHaveBeenCalled();
    });
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
