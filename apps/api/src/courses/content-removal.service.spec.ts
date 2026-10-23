import { ContentRemovalService, ContentTarget } from './content-removal.service';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

/**
 * Borrar una tarea, un módulo o un curso.
 *
 * Las entregas cuelgan de su tarea, que al borrarse sólo las suelta: si no se borran con ella
 * quedan filas sin curso que nadie ve y archivos en el disco para siempre.
 */

type Where = Record<string, unknown>;

function removalWith({ failDelete = false } = {}) {
  const steps: string[] = [];
  const queries: { submissions: Where[]; resources: Where[]; notifications: Where[] } = {
    submissions: [],
    resources: [],
    notifications: [],
  };
  const operation = (name: string) => () => {
    steps.push(name);
    return { count: 1 };
  };

  const prisma = {
    course: {
      findUnique: async () => ({ coverImage: 'portadas/curso.jpg' }),
      delete: operation('borrar curso'),
    },
    courseModule: { delete: operation('borrar módulo') },
    resource: {
      findMany: async ({ where }: { where: Where }) => {
        queries.resources.push(where);
        return [
          { guid: 'tarea-1', attachmentKey: 'recursos/guia.pdf', fileUrl: null },
          { guid: 'video-1', attachmentKey: null, fileUrl: 'recursos/video.mp4' },
          { guid: 'lectura-1', attachmentKey: null, fileUrl: null },
        ];
      },
      delete: operation('borrar recurso'),
    },
    submission: {
      findMany: async ({ where }: { where: Where }) => {
        queries.submissions.push(where);
        return [
          { guid: 'entrega-ana', attachmentKey: 'entregas/informe-ana.pdf' },
          { guid: 'entrega-beto', attachmentKey: 'entregas/informe-beto.pdf' },
          { guid: 'entrega-texto', attachmentKey: null },
        ];
      },
      deleteMany: ({ where }: { where: Where }) => {
        queries.submissions.push(where);
        steps.push('borrar entregas');
        return { count: 2 };
      },
    },
    notification: {
      deleteMany: ({ where }: { where: Where }) => {
        queries.notifications.push(where);
        steps.push('retirar avisos');
        return { count: 3 };
      },
    },
    $transaction: async (operations: unknown[]) => {
      if (failDelete) throw new Error('la base no responde');
      steps.push(`transacción de ${operations.length}`);
      return operations;
    },
  };

  const ownership = fileOwnershipDouble();
  ownership.deleteUnreferenced.mockImplementation(async () => {
    steps.push('retirar archivos');
  });
  const service = new ContentRemovalService(prisma as never, ownership.files);
  return { service, steps, queries, retired: ownership.retired };
}

describe('ContentRemovalService', () => {
  const MATERIAL_AND_DELIVERIES = [
    'recursos/guia.pdf',
    'recursos/video.mp4',
    'entregas/informe-ana.pdf',
    'entregas/informe-beto.pdf',
  ];

  it.each<[string, ContentTarget, string, Where]>([
    ['una tarea', { resourceGuid: 'tarea-1' }, 'borrar recurso', { guid: 'tarea-1' }],
    ['un módulo', { moduleGuid: 'modulo-1' }, 'borrar módulo', { moduleGuid: 'modulo-1' }],
  ])(
    'borrar %s borra sus entregas en la misma transacción y después retira el material y los archivos entregados',
    async (_, target, deleteRow, resources) => {
      const { service, steps, queries, retired } = removalWith();

      await service.remove(target);

      expect(steps).toEqual(['retirar avisos', 'borrar entregas', deleteRow, 'transacción de 3', 'retirar archivos']);
      expect(queries.submissions).toContainEqual({ assignment: resources });
      expect(retired()).toEqual(MATERIAL_AND_DELIVERIES);
    },
  );

  it('borrar un curso retira además su portada', async () => {
    const { service, steps, retired } = removalWith();

    await service.remove({ courseGuid: 'curso-1' });

    expect(steps).toEqual([
      'retirar avisos',
      'borrar entregas',
      'borrar curso',
      'transacción de 3',
      'retirar archivos',
    ]);
    expect(retired()).toEqual(['portadas/curso.jpg', ...MATERIAL_AND_DELIVERIES]);
  });

  it('sólo busca en las entregas y el material de lo que se borra', async () => {
    const { service, queries } = removalWith();

    await service.remove({ moduleGuid: 'modulo-1' });

    expect(queries.submissions[0]).toEqual({ assignment: { moduleGuid: 'modulo-1' } });
    expect(queries.resources[0]).toEqual({ moduleGuid: 'modulo-1' });
  });

  it('retira los avisos que apuntan a lo borrado: el curso, sus cuestionarios y sus entregas', async () => {
    const { service, queries } = removalWith();

    await service.remove({ courseGuid: 'curso-1' });

    expect(queries.notifications[0]).toEqual({
      OR: [
        { refType: 'curso', refGuid: 'curso-1' },
        { refType: 'quiz', refGuid: { in: ['tarea-1', 'video-1', 'lectura-1'] } },
        { refType: 'entrega', refGuid: { in: ['entrega-ana', 'entrega-beto', 'entrega-texto'] } },
      ],
    });
  });

  it('si no se puede borrar, no retira ningún archivo', async () => {
    const { service, retired } = removalWith({ failDelete: true });

    await expect(service.remove({ resourceGuid: 'tarea-1' })).rejects.toThrow('la base no responde');

    expect(retired()).toEqual([]);
  });
});
