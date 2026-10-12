import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileOwnershipService } from './file-ownership.service';
import { StorageService } from './storage.service';

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
function campusRows({ failQueries = false }: { failQueries?: boolean } = {}) {
  const registry: Record<string, Row> = {
    'portadas/ana.png': { folder: 'portadas', uploaderGuid: 'ana', country: 'COLOMBIA' },
    'portadas/beto.png': { folder: 'portadas', uploaderGuid: 'beto', country: 'COLOMBIA' },
    'logos/colombia.png': { folder: 'logos', uploaderGuid: 'admin-co', country: 'COLOMBIA' },
  };

  const prisma = {
    storedFile: {
      findUnique: async ({ where }: { where: { key: string } }) => registry[where.key] ?? null,
      deleteMany: async () => ({ count: 0 }),
    },
    course: table([{ coverImage: 'portadas/compartida.png' }]),
    resource: table([{ attachmentKey: 'recursos/guia.pdf', fileUrl: null }]),
    user: table([{ photoUrl: 'avatars/foto.png', signatureUrl: 'firmas/firma.png' }]),
    countrySettings: table([{ logoUrl: 'logos/colombia.png', faviconUrl: null, loginBackgroundUrl: null }]),
    submission: table([{ attachmentKey: 'entregas/actual.pdf' }]),
    certificate: table([{ pdfKey: 'certificados/c1.pdf' }]),
  };
  if (failQueries) {
    prisma.course = {
      findMany: async () => {
        throw new Error('la base no responde');
      },
    };
  }
  return prisma;
}

function campus(options: { failQueries?: boolean } = {}) {
  const storage = { deleteFiles: jest.fn(async () => undefined) };
  const service = new FileOwnershipService(campusRows(options) as never, storage as never);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return { service, storage };
}

/** El mismo campus, con los archivos de verdad en una carpeta temporal. */
function campusOnDisk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-archivos-'));
  const prisma = campusRows();
  const config = { get: (key: string) => ({ STORAGE_DIR: root, JWT_SECRET: 'secreto-de-pruebas' })[key] };
  const storage = new StorageService(config as unknown as ConfigService, prisma as never);
  jest.spyOn(storage['logger'], 'log').mockImplementation(() => undefined);
  const service = new FileOwnershipService(prisma as never, storage);

  return {
    service,
    put: (...keys: string[]) => Promise.all(keys.map((key) => storage.saveWithKey(key, Buffer.from('imagen')))),
    onDisk: (key: string) => fs.existsSync(path.join(root, key)),
    cleanUp: () => fs.rmSync(root, { recursive: true, force: true }),
  };
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

  it('consulta las tablas una tras otra: una limpieza no ocupa varias conexiones a la vez', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const findMany = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight--;
      return [];
    };
    const models = ['course', 'resource', 'user', 'countrySettings', 'submission', 'certificate'];
    const prisma = Object.fromEntries(models.map((model) => [model, { findMany }]));
    const storage = { deleteFiles: jest.fn(async () => undefined) };
    const service = new FileOwnershipService(prisma as never, storage as never);

    await service.deleteUnreferenced(['entregas/vieja.pdf']);

    expect(maxInFlight).toBe(1);
    expect(storage.deleteFiles).toHaveBeenCalledWith(['entregas/vieja.pdf']);
  });

  it('si no puede comprobar quién los usa, no borra nada y no falla', async () => {
    const { service, storage } = campus({ failQueries: true });

    await expect(service.deleteUnreferenced(['portadas/vieja.png'])).resolves.toBeUndefined();
    expect(storage.deleteFiles).not.toHaveBeenCalled();
  });
});

describe('FileOwnershipService · sustituir o quitar el archivo de un campo', () => {
  let disk: ReturnType<typeof campusOnDisk>;
  beforeEach(() => {
    disk = campusOnDisk();
  });
  afterEach(() => disk.cleanUp());

  const ANA = { uploader: 'ana' };

  it('quitar el archivo lo borra del disco', async () => {
    await disk.put('portadas/vieja.png');

    await disk.service.replace([{ folder: 'portadas', current: 'portadas/vieja.png', next: null }], ANA, async () => 1);

    expect(disk.onDisk('portadas/vieja.png')).toBe(false);
  });

  it('sustituirlo borra del disco el anterior y conserva el nuevo', async () => {
    await disk.put('portadas/vieja.png', 'portadas/ana.png');

    await disk.service.replace(
      [{ folder: 'portadas', current: 'portadas/vieja.png', next: 'portadas/ana.png' }],
      ANA,
      async () => 1,
    );

    expect(disk.onDisk('portadas/vieja.png')).toBe(false);
    expect(disk.onDisk('portadas/ana.png')).toBe(true);
  });

  it('conserva el anterior si otra fila lo sigue usando', async () => {
    await disk.put('portadas/compartida.png');

    await disk.service.replace(
      [{ folder: 'portadas', current: 'portadas/compartida.png', next: null }],
      ANA,
      async () => 1,
    );

    expect(disk.onDisk('portadas/compartida.png')).toBe(true);
  });

  it('guardar sin tocar el campo no borra nada', async () => {
    await disk.put('portadas/vieja.png');

    await disk.service.replace(
      [{ folder: 'portadas', current: 'portadas/vieja.png', next: undefined }],
      ANA,
      async () => 1,
    );

    expect(disk.onDisk('portadas/vieja.png')).toBe(true);
  });

  it('con un archivo ajeno no guarda la fila ni borra el anterior', async () => {
    await disk.put('portadas/vieja.png');
    const save = jest.fn(async () => 1);

    await expect(
      disk.service.replace(
        [{ folder: 'portadas', current: 'portadas/vieja.png', next: 'portadas/beto.png' }],
        ANA,
        save,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
    expect(disk.onDisk('portadas/vieja.png')).toBe(true);
  });

  it('si la fila no se guarda, el anterior sigue en el disco', async () => {
    await disk.put('portadas/vieja.png');
    const failingSave = async () => {
      throw new Error('la base no responde');
    };

    await expect(
      disk.service.replace([{ folder: 'portadas', current: 'portadas/vieja.png', next: null }], ANA, failingSave),
    ).rejects.toThrow('la base no responde');
    expect(disk.onDisk('portadas/vieja.png')).toBe(true);
  });
});

describe('FileOwnershipService · adoptar un archivo recién subido', () => {
  let disk: ReturnType<typeof campusOnDisk>;
  beforeEach(() => {
    disk = campusOnDisk();
  });
  afterEach(() => disk.cleanUp());

  it('borra del disco el archivo al que sustituye', async () => {
    await disk.put('avatars/vieja.png', 'avatars/nueva.png');

    await disk.service.adoptUpload(
      'avatars/nueva.png',
      async () => 'avatars/vieja.png',
      (previous) => previous,
    );

    expect(disk.onDisk('avatars/vieja.png')).toBe(false);
    expect(disk.onDisk('avatars/nueva.png')).toBe(true);
  });

  it('si la fila no se guarda, retira la subida y conserva el anterior', async () => {
    await disk.put('avatars/vieja.png', 'avatars/nueva.png');
    const failingSave = async (): Promise<string> => {
      throw new Error('la base no responde');
    };

    await expect(disk.service.adoptUpload('avatars/nueva.png', failingSave, (previous) => previous)).rejects.toThrow(
      'la base no responde',
    );
    expect(disk.onDisk('avatars/nueva.png')).toBe(false);
    expect(disk.onDisk('avatars/vieja.png')).toBe(true);
  });
});
