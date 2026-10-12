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
  const queries: { submissions: Where[]; resources: Where[] } = { submissions: [], resources: [] };
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
          { attachmentKey: 'recursos/guia.pdf', fileUrl: null },
          { attachmentKey: null, fileUrl: 'recursos/video.mp4' },
        ];
      },
      delete: operation('borrar recurso'),
    },
    submission: {
      findMany: async ({ where }: { where: Where }) => {
        queries.submissions.push(where);
        return [{ attachmentKey: 'entregas/informe-ana.pdf' }, { attachmentKey: 'entregas/informe-beto.pdf' }];
      },
      deleteMany: ({ where }: { where: Where }) => {
        queries.submissions.push(where);
        steps.push('borrar entregas');
        return { count: 2 };
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

      expect(steps).toEqual(['borrar entregas', deleteRow, 'transacción de 2', 'retirar archivos']);
      expect(queries.submissions).toContainEqual({ assignment: resources });
      expect(retired()).toEqual(MATERIAL_AND_DELIVERIES);
    },
  );

  it('borrar un curso retira además su portada', async () => {
    const { service, steps, retired } = removalWith();

    await service.remove({ courseGuid: 'curso-1' });

    expect(steps).toEqual(['borrar entregas', 'borrar curso', 'transacción de 2', 'retirar archivos']);
    expect(retired()).toEqual(['portadas/curso.jpg', ...MATERIAL_AND_DELIVERIES]);
  });

  it('sólo busca archivos en las entregas y el material de lo que se borra', async () => {
    const { service, queries } = removalWith();

    await service.remove({ moduleGuid: 'modulo-1' });

    expect(queries.submissions[0]).toEqual({ assignment: { moduleGuid: 'modulo-1' }, attachmentKey: { not: null } });
    expect(queries.resources[0]).toMatchObject({ moduleGuid: 'modulo-1' });
  });

  it('si no se puede borrar, no retira ningún archivo', async () => {
    const { service, retired } = removalWith({ failDelete: true });

    await expect(service.remove({ resourceGuid: 'tarea-1' })).rejects.toThrow('la base no responde');

    expect(retired()).toEqual([]);
  });
});
