import { ForbiddenException } from '@nestjs/common';
import { CourseContentService } from './course-content.service';
import { sessionFor } from '../common/testing/test-campus';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/**
 * Contenido de un curso: lo que se guarda al editar un recurso y lo que se borra del
 * almacenamiento al quitar contenido. Ninguna tarea periódica recoge archivos sin uso: el que
 * no se borra al desvincularlo se queda ocupando espacio para siempre. Qué se lleva cada
 * borrado lo fija `content-removal.service.spec.ts`.
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
  const removal = { remove: jest.fn(async () => undefined) };
  const service = new CourseContentService(
    prisma as never,
    access as never,
    storage as never,
    ownership.files,
    removal as never,
  );
  return { service, files: ownership, deletedFiles: ownership.retired, removal };
}

describe('CourseContentService', () => {
  it('borrar un módulo o una tarea se lleva sus entregas y sus archivos', async () => {
    const { service, removal } = serviceWith({});

    await service.deleteModule('modulo-1', ADMIN);
    await service.deleteResource('tarea-1', ADMIN);

    expect(removal.remove.mock.calls).toEqual([[{ moduleGuid: 'modulo-1' }], [{ resourceGuid: 'tarea-1' }]]);
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
      const { service } = serviceWith({ resource: { aggregate: async () => ({ _max: { position: null } }), create } });

      await expect(
        service.createResource('modulo-1', { type: 'LINK', contentHtml: 'no-es-url' }, ADMIN),
      ).rejects.toThrow(/URL completa/);
      expect(create).not.toHaveBeenCalled();
    });
  });

  it('lo nuevo va al final aunque se haya borrado algo antes: la última posición más uno', async () => {
    // Quedan las posiciones 1, 2 y 3 tras borrar la 0: contar daría 3 y repetiría la última.
    const last = async () => ({ _max: { position: 3 } });
    const created: { model: string; position: number }[] = [];
    const record =
      (model: string) =>
      async ({ data }: { data: { position: number } }) => {
        created.push({ model, position: data.position });
        return { guid: 'nuevo' };
      };
    const { service } = serviceWith({
      courseModule: { aggregate: last, create: record('módulo') },
      resource: { aggregate: last, create: record('recurso') },
    });

    await service.createModule('curso-1', { title: 'Nuevo' }, ADMIN);
    await service.createResource('modulo-1', { type: 'TEXT' }, ADMIN);

    expect(created).toEqual([
      { model: 'módulo', position: 4 },
      { model: 'recurso', position: 4 },
    ]);
  });

  it('un recurso nuevo llega completo: si algo no vale, no se crea nada', async () => {
    const create = jest.fn(async () => ({ guid: 'r1' }));
    const { service } = serviceWith({ resource: { aggregate: async () => ({ _max: { position: null } }), create } });

    await expect(
      service.createResource('modulo-1', { type: 'ASSIGNMENT', quizConfig: '{"questions":"no"}' }, ADMIN),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('un recurso nuevo guarda en el alta todo lo que trae, adjunto incluido', async () => {
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ guid: 'r1', ...data }));
    const { service } = serviceWith({ resource: { aggregate: async () => ({ _max: { position: null } }), create } });

    await service.createResource(
      'modulo-1',
      {
        type: 'TEXT',
        title: 'Lectura',
        contentHtml: '<p>Hola</p>',
        referenceUrl: 'https://ejemplo.com',
        attachmentKey: 'recursos/1-guia.pdf',
        attachmentName: 'guia.pdf',
      },
      ADMIN,
    );

    expect(create.mock.calls[0][0].data).toMatchObject({
      title: 'Lectura',
      contentHtml: '<p>Hola</p>',
      referenceUrl: 'https://ejemplo.com',
      attachmentKey: 'recursos/1-guia.pdf',
      attachmentName: 'guia.pdf',
    });
  });

  it('el primero de un módulo vacío va en la posición 0', async () => {
    const create = jest.fn(async ({ data }: { data: { position: number } }) => data);
    const { service } = serviceWith({ resource: { aggregate: async () => ({ _max: { position: null } }), create } });

    await expect(service.createResource('modulo-1', { type: 'TEXT' }, ADMIN)).resolves.toMatchObject({ position: 0 });
  });

  it('reordenar los módulos sólo toca los del curso, en el orden pedido', async () => {
    const updates: { guid: string; position: number }[] = [];
    const { service } = serviceWith({
      courseModule: {
        findMany: async () => [{ guid: 'm1' }, { guid: 'm2' }, { guid: 'm3' }],
        update: ({ where, data }: { where: { guid: string }; data: { position: number } }) => {
          updates.push({ guid: where.guid, position: data.position });
          return Promise.resolve();
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    });

    await service.reorderModules('curso-1', ['m3', 'modulo-de-otro-curso', 'm1', 'm2'], ADMIN);

    expect(updates).toEqual([
      { guid: 'm3', position: 0 },
      { guid: 'm1', position: 1 },
      { guid: 'm2', position: 2 },
    ]);
  });

  it('reordenar ignora identificadores ajenos y repetidos', async () => {
    const updates: { guid: string; position: number }[] = [];
    const { service } = serviceWith({
      resource: {
        findMany: async () => [{ guid: 'r1' }, { guid: 'r2' }],
        update: ({ where, data }: { where: { guid: string }; data: { position: number } }) => {
          updates.push({ guid: where.guid, position: data.position });
          return Promise.resolve();
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    });

    await service.reorderResources('modulo-1', ['r2', 'recurso-de-otro-modulo', 'r2', 'r1'], ADMIN);

    expect(updates).toEqual([
      { guid: 'r2', position: 0 },
      { guid: 'r1', position: 1 },
    ]);
  });
});
