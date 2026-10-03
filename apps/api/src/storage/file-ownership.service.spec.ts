import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileOwnershipService } from './file-ownership.service';

type Row = Record<string, unknown>;
type Condition = Record<string, { in: string[] }>;

/** Tabla en memoria que entiende las consultas `IN` y `OR` que hace el servicio. */
function table(rows: Row[]) {
  const matches = (row: Row, where: Condition | { OR: Condition[] }): boolean =>
    'OR' in where
      ? (where.OR as Condition[]).some((condition) => matches(row, condition))
      : Object.entries(where).every(([field, { in: values }]) => values.includes(row[field] as string));

  return {
    findMany: async ({ where }: { where: Condition | { OR: Condition[] } }) =>
      rows.filter((row) => matches(row, where)),
  };
}

/**
 * Registro de subidas y filas que guardan claves, con lo mínimo para el servicio.
 * La portada de la profesora Ana es suya; la de Beto, de otra persona de su misma sede.
 */
function campus({ failQueries = false }: { failQueries?: boolean } = {}) {
  const registry: Record<string, Row> = {
    'portadas/ana.png': { folder: 'portadas', uploaderGuid: 'ana', country: 'COLOMBIA' },
    'portadas/beto.png': { folder: 'portadas', uploaderGuid: 'beto', country: 'COLOMBIA' },
    'logos/colombia.png': { folder: 'logos', uploaderGuid: 'admin-co', country: 'COLOMBIA' },
  };

  const prisma = {
    storedFile: { findUnique: async ({ where }: { where: { key: string } }) => registry[where.key] ?? null },
    course: table([{ coverImage: 'portadas/compartida.png' }]),
    resource: table([{ attachmentKey: 'recursos/guia.pdf', fileUrl: null }]),
    user: table([{ photoUrl: 'avatars/foto.png', signatureUrl: 'firmas/firma.png' }]),
    countrySettings: table([{ logoUrl: 'logos/colombia.png', faviconUrl: null, loginBackgroundUrl: null }]),
    submission: table([{ attachmentKey: 'entregas/actual.pdf' }]),
    archivedSubmission: table([{ attachmentKey: 'entregas/archivada.pdf' }]),
    certificate: table([{ pdfKey: 'certificados/c1.pdf' }]),
  };
  if (failQueries) {
    prisma.course = {
      findMany: async () => {
        throw new Error('la base no responde');
      },
    };
  }

  const storage = { deleteFiles: jest.fn(async () => undefined) };
  const service = new FileOwnershipService(prisma as never, storage as never);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return { service, storage };
}

describe('FileOwnershipService · usar una clave', () => {
  it('admite un archivo que subió quien lo guarda', async () => {
    const { service } = campus();

    await expect(
      service.assertCanUse('portadas/ana.png', null, 'portadas', { uploader: 'ana' }),
    ).resolves.toBeUndefined();
  });

  it('rechaza el archivo de otra persona, aunque sea de la misma sede', async () => {
    const { service } = campus();

    await expect(service.assertCanUse('portadas/beto.png', null, 'portadas', { uploader: 'ana' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza una clave que no consta como subida', async () => {
    const { service } = campus();

    await expect(service.assertCanUse('portadas/inventada.png', null, 'portadas', { uploader: 'ana' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un archivo subido a otra carpeta', async () => {
    const { service } = campus();

    await expect(service.assertCanUse('portadas/ana.png', null, 'firmas', { uploader: 'ana' })).rejects.toThrow(
      /no corresponde a este campo/,
    );
  });

  it('en la configuración vale cualquier archivo de la sede, pero no uno de la otra', async () => {
    const { service } = campus();

    await expect(
      service.assertCanUse('logos/colombia.png', null, 'logos', { country: 'COLOMBIA' }),
    ).resolves.toBeUndefined();
    await expect(service.assertCanUse('logos/colombia.png', null, 'logos', { country: 'MEXICO' })).rejects.toThrow(
      /otra sede/,
    );
  });

  it('no revisa una clave que no cambia: los archivos anteriores al registro siguen valiendo', async () => {
    const { service } = campus();

    await expect(
      service.assertCanUse('portadas/antigua.png', 'portadas/antigua.png', 'portadas', { uploader: 'ana' }),
    ).resolves.toBeUndefined();
  });

  it('quitar el archivo no exige nada', async () => {
    const { service } = campus();

    await expect(
      service.assertCanUse(null, 'portadas/ana.png', 'portadas', { uploader: 'ana' }),
    ).resolves.toBeUndefined();
    await expect(service.assertCanUse(undefined, null, 'portadas', { uploader: 'ana' })).resolves.toBeUndefined();
  });
});

describe('FileOwnershipService · retirar archivos', () => {
  it('borra sólo los que ya no guarda ninguna fila', async () => {
    const { service, storage } = campus();

    await service.deleteUnreferenced([
      'portadas/vieja.png',
      'portadas/compartida.png',
      'recursos/guia.pdf',
      'avatars/foto.png',
      'firmas/firma.png',
      'logos/colombia.png',
      'entregas/actual.pdf',
      'entregas/archivada.pdf',
      'certificados/c1.pdf',
      'recursos/suelto.pdf',
    ]);

    expect(storage.deleteFiles).toHaveBeenCalledWith(['portadas/vieja.png', 'recursos/suelto.pdf']);
  });

  it('ignora vacíos, repetidos y claves mal formadas', async () => {
    const { service, storage } = campus();

    await service.deleteUnreferenced([null, undefined, '../fuera.txt', 'portadas/vieja.png', 'portadas/vieja.png']);

    expect(storage.deleteFiles).toHaveBeenCalledWith(['portadas/vieja.png']);
  });

  it('si no puede comprobar quién los usa, no borra nada y no falla', async () => {
    const { service, storage } = campus({ failQueries: true });

    await expect(service.deleteUnreferenced(['portadas/vieja.png'])).resolves.toBeUndefined();
    expect(storage.deleteFiles).not.toHaveBeenCalled();
  });
});
