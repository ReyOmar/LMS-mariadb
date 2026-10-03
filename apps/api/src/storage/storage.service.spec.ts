import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BadRequestException, Logger, PayloadTooLargeException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';
import { isPublicKey, isStorageKey } from './folders';

const UPLOADER = { sub: 'profe-1', country: 'COLOMBIA' as const };

/** Registro de subidas en memoria, en lugar de la tabla `lms_archivos`. */
function fakeRegistry() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    storedFile: {
      create: jest.fn(async ({ data }: { data: { key: string } }) => {
        rows.set(data.key, data);
        return data;
      }),
      deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => ({ count: rows.delete(where.key) ? 1 : 0 })),
    },
  };
}

/** Configuración mínima: sin R2, para que el servicio use el disco local. */
function createService(values: Record<string, string> = {}, prisma = fakeRegistry()): StorageService {
  const config = {
    get: (key: string) => ({ JWT_SECRET: 'secreto-de-pruebas-suficientemente-largo', ...values })[key],
  } as unknown as ConfigService;

  return new StorageService(config, prisma as never);
}

const UPLOADS = path.resolve(__dirname, '..', '..', 'uploads');

describe('StorageService', () => {
  describe('clasificación de archivos', () => {
    it('trata como público sólo el material de marca', () => {
      expect(isPublicKey('logos/abc.png')).toBe(true);
      expect(isPublicKey('portadas/abc.png')).toBe(true);
      expect(isPublicKey('fondos/abc.jpg')).toBe(true);
      expect(isPublicKey('avatars/abc.png')).toBe(true);
    });

    it('trata como reservado todo lo que documenta a una persona', () => {
      // Entregas, certificados y firmas identifican a alguien: no pueden quedar accesibles
      // por conocer la URL.
      expect(isPublicKey('entregas/abc.pdf')).toBe(false);
      expect(isPublicKey('certificados/abc.pdf')).toBe(false);
      expect(isPublicKey('firmas/abc.png')).toBe(false);
      expect(isPublicKey('recursos/abc.pdf')).toBe(false);
    });
  });

  describe('forma de las claves', () => {
    it('acepta las claves que genera el propio servicio', () => {
      expect(isStorageKey('entregas/1789941375380-b13c4b5df175.txt')).toBe(true);
      expect(isStorageKey('certificados/efb6b21a-8fdd-43db-a2d8-8e4abcd24813.pdf')).toBe(true);
      expect(isStorageKey('recursos/1789941375380-b13c4b5df175.pdf.parcial')).toBe(true);
    });

    it.each([
      ['una subida de directorio', 'recursos/..'],
      ['una ruta relativa', '../prisma/schema.prisma'],
      ['un nivel de más', 'recursos/a/b.pdf'],
      ['una barra invertida', 'recursos/..\\..\\secreto.txt'],
      ['una carpeta desconocida', 'config/a.pdf'],
      ['un fichero oculto', 'logos/.env'],
      ['un nombre vacío', 'logos/'],
      ['una ruta absoluta', '/etc/passwd'],
    ])('rechaza %s', (_case, key) => {
      expect(isStorageKey(key)).toBe(false);
    });

    it('puede exigir una carpeta concreta', () => {
      expect(isStorageKey('firmas/a.png', ['firmas'])).toBe(true);
      expect(isStorageKey('certificados/a.pdf', ['firmas'])).toBe(false);
    });
  });

  describe('URLs de descarga', () => {
    it('sirve el material de marca sin firma', () => {
      const url = createService().downloadUrl('logos/marca.png');

      expect(url).toBe('/api/storage/download/logos/marca.png');
      expect(url).not.toContain('sig=');
    });

    it('firma el material reservado y le pone caducidad', () => {
      const url = createService().downloadUrl('entregas/tarea.pdf');

      expect(url).toContain('/api/storage/download/entregas/tarea.pdf');
      expect(url).toMatch(/exp=\d+/);
      expect(url).toMatch(/sig=[0-9a-f]{64}/);
    });

    it('lleva el nombre original para la descarga, fuera de la firma', () => {
      const service = createService();
      const url = service.downloadUrl('entregas/1789941375380-b13c4b5df175.pdf', 'Informe final (versión 2).pdf');
      const query = new URLSearchParams(url.split('?')[1]);

      expect(query.get('originalName')).toBe('Informe final (versión 2).pdf');
      expect(
        service.isValidSignature(
          'entregas/1789941375380-b13c4b5df175.pdf',
          query.get('exp') ?? undefined,
          query.get('sig') ?? undefined,
        ),
      ).toBe(true);
      expect(service.downloadUrl('logos/marca.png', 'Logo sede.png')).toBe(
        '/api/storage/download/logos/marca.png?originalName=Logo%20sede.png',
      );
    });
  });

  describe('verificación de la firma', () => {
    const service = createService();

    /** Extrae los parámetros de una URL firmada. */
    const parts = (url: string) => {
      const query = new URLSearchParams(url.split('?')[1]);
      return { exp: query.get('exp') ?? undefined, sig: query.get('sig') ?? undefined };
    };

    it('acepta una firma recién emitida', () => {
      const { exp, sig } = parts(service.downloadUrl('entregas/tarea.pdf'));

      expect(service.isValidSignature('entregas/tarea.pdf', exp, sig)).toBe(true);
    });

    it('rechaza la firma de otro archivo', () => {
      // Sin esta comprobación, una URL legítima valdría para descargar cualquier cosa.
      const { exp, sig } = parts(service.downloadUrl('entregas/mia.pdf'));

      expect(service.isValidSignature('entregas/de-otro.pdf', exp, sig)).toBe(false);
    });

    it('rechaza una firma caducada', () => {
      const { sig } = parts(service.downloadUrl('entregas/tarea.pdf'));
      const yesterday = String(Math.floor(Date.now() / 1000) - 60);

      expect(service.isValidSignature('entregas/tarea.pdf', yesterday, sig)).toBe(false);
    });

    it('rechaza una caducidad alargada a mano', () => {
      const { sig } = parts(service.downloadUrl('entregas/tarea.pdf'));
      const inOneYear = String(Math.floor(Date.now() / 1000) + 31_536_000);

      // La caducidad forma parte de lo firmado, así que cambiarla invalida la firma.
      expect(service.isValidSignature('entregas/tarea.pdf', inOneYear, sig)).toBe(false);
    });

    it('rechaza una firma ausente o manipulada', () => {
      const { exp } = parts(service.downloadUrl('entregas/tarea.pdf'));

      expect(service.isValidSignature('entregas/tarea.pdf', exp, undefined)).toBe(false);
      expect(service.isValidSignature('entregas/tarea.pdf', exp, 'a'.repeat(64))).toBe(false);
      expect(service.isValidSignature('entregas/tarea.pdf', undefined, 'x')).toBe(false);
    });

    it('no valida firmas emitidas con otro secreto', () => {
      const otherService = createService({ STORAGE_SECRET: 'otro-secreto-distinto-y-largo' });
      const { exp, sig } = parts(otherService.downloadUrl('entregas/tarea.pdf'));

      expect(service.isValidSignature('entregas/tarea.pdf', exp, sig)).toBe(false);
    });
  });

  describe('subida de archivos', () => {
    const service = createService();
    const pdf = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(100)]);

    /**
     * El archivo llega ya escrito en un temporal —así no pasa por memoria—, de modo que
     * las pruebas trabajan con ficheros reales igual que el servicio.
     */
    const tempFiles: string[] = [];
    const storedKeys: string[] = [];
    function asTempFile(content: Buffer): string {
      const filePath = path.join(os.tmpdir(), `prueba-${crypto.randomUUID()}`);
      fs.writeFileSync(filePath, content);
      tempFiles.push(filePath);
      return filePath;
    }

    afterAll(async () => {
      for (const filePath of tempFiles) fs.rmSync(filePath, { force: true });
      await service.deleteFiles(storedKeys);
    });

    it('rechaza una extensión no admitida', async () => {
      const filePath = asTempFile(pdf);
      await expect(service.uploadFromDisk(filePath, 'programa.exe', 'recursos', UPLOADER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza un archivo cuyo contenido no corresponde a su extensión', async () => {
      // Un ejecutable renombrado a .pdf: la extensión pasa, la firma del archivo no.
      const filePath = asTempFile(Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(100)]));

      await expect(service.uploadFromDisk(filePath, 'informe.pdf', 'recursos', UPLOADER)).rejects.toThrow(
        /no corresponde/,
      );
    });

    it('rechaza un archivo que supera el límite indicado y dice cuál es', async () => {
      const filePath = asTempFile(Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]));

      await expect(service.uploadFromDisk(filePath, 'informe.pdf', 'entregas', UPLOADER, 1024 * 1024)).rejects.toThrow(
        new PayloadTooLargeException('El archivo supera el límite de 1 MB de esta tarea.'),
      );
    });

    it('acepta un archivo que mide exactamente el límite', async () => {
      const filePath = asTempFile(Buffer.concat([pdf, Buffer.alloc(1024 * 1024 - pdf.length)]));
      const key = await service.uploadFromDisk(filePath, 'informe.pdf', 'entregas', UPLOADER, 1024 * 1024);

      storedKeys.push(key);
      expect(fs.statSync(path.resolve(__dirname, '..', '..', 'uploads', key)).size).toBe(1024 * 1024);
    });

    it('mantiene el tope fijo de las imágenes aunque se pida uno mayor', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(3 * 1024 * 1024)]);

      await expect(
        service.uploadFromDisk(asTempFile(png), 'firma.png', 'firmas', UPLOADER, 50 * 1024 * 1024),
      ).rejects.toThrow('La imagen supera el límite de 2 MB.');
    });

    // Las carpetas públicas se sirven sin firma: si admitieran cualquier formato, serían un
    // alojamiento de archivos abierto desde el dominio del campus.
    it('no acepta un documento en una carpeta pública de imágenes', async () => {
      const filePath = asTempFile(pdf);

      await expect(service.uploadFromDisk(filePath, 'foto.pdf', 'avatars', UPLOADER)).rejects.toThrow(
        /sólo se admiten imágenes/,
      );
    });

    it('no acepta una firma que el certificado no sabría imprimir', async () => {
      // Se veía bien en la vista previa del navegador y desaparecía de todos los PDF.
      const webp = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.alloc(100)]);
      const filePath = asTempFile(webp);

      await expect(service.uploadFromDisk(filePath, 'firma.webp', 'firmas', UPLOADER)).rejects.toThrow(
        /sólo se admiten imágenes/,
      );
    });

    it('acepta una imagen en una carpeta de imágenes', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]);
      const filePath = asTempFile(png);
      const key = await service.uploadFromDisk(filePath, 'foto.png', 'avatars', UPLOADER);

      expect(key).toMatch(/^avatars\/.+\.png$/);
      storedKeys.push(key);
    });

    it('acepta un archivo válido y le da una clave dentro de su carpeta', async () => {
      const filePath = asTempFile(pdf);
      const key = await service.uploadFromDisk(filePath, 'informe.pdf', 'entregas', UPLOADER);

      expect(key).toMatch(/^entregas\/\d+-[0-9a-f]{12}\.pdf$/);
      storedKeys.push(key);
    });

    it('guarda en apps/api/uploads, se lance el proceso desde donde se lance', async () => {
      const key = await service.uploadFromDisk(asTempFile(pdf), 'informe.pdf', 'entregas', UPLOADER);
      storedKeys.push(key);

      expect(fs.existsSync(path.resolve(__dirname, '..', '..', 'uploads', key))).toBe(true);
    });
  });

  describe('registro de subidas', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]);
    let tempFile: string;

    beforeEach(() => {
      tempFile = path.join(os.tmpdir(), `prueba-${crypto.randomUUID()}`);
      fs.writeFileSync(tempFile, png);
    });
    afterEach(() => fs.rmSync(tempFile, { force: true }));

    it('anota cada subida con su carpeta, quién la subió y su sede', async () => {
      const registry = fakeRegistry();
      const service = createService({}, registry);

      const key = await service.uploadFromDisk(tempFile, 'portada.png', 'portadas', UPLOADER);

      expect(registry.rows.get(key)).toEqual({ key, folder: 'portadas', uploaderGuid: 'profe-1', country: 'COLOMBIA' });
      await service.deleteFile(key);
      expect(registry.rows.has(key)).toBe(false);
    });

    it('si no se puede anotar, retira el archivo: nadie podría usarlo', async () => {
      const registry = fakeRegistry();
      registry.storedFile.create.mockRejectedValueOnce(new Error('la base no responde'));
      const service = createService({}, registry);
      jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

      await expect(service.uploadFromDisk(tempFile, 'portada.png', 'portadas', UPLOADER)).rejects.toThrow(
        'la base no responde',
      );
      const [{ where }] = registry.storedFile.deleteMany.mock.calls[0];
      expect(fs.existsSync(path.join(UPLOADS, where.key))).toBe(false);
    });
  });

  describe('contenido que no corresponde a la extensión', () => {
    const service = createService();
    const storedKeys: string[] = [];
    const tempFiles: string[] = [];

    function upload(content: Buffer, name: string, folder: 'recursos' | 'entregas' = 'recursos') {
      const filePath = path.join(os.tmpdir(), `prueba-${crypto.randomUUID()}`);
      fs.writeFileSync(filePath, content);
      tempFiles.push(filePath);
      return service.uploadFromDisk(filePath, name, folder, UPLOADER).then((key) => {
        storedKeys.push(key);
        return key;
      });
    }

    afterAll(async () => {
      for (const filePath of tempFiles) fs.rmSync(filePath, { force: true });
      await service.deleteFiles(storedKeys);
    });

    const executable = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(100)]);
    const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)]);
    const rar = Buffer.concat([Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1'), Buffer.alloc(100)]);
    const mp4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(100)]);

    it.each(['.doc', '.xls', '.ppt', '.rar', '.mp4', '.txt', '.csv'])(
      'rechaza un ejecutable renombrado a %s',
      async (ext) => {
        await expect(upload(executable, `programa${ext}`)).rejects.toThrow(/no corresponde/);
      },
    );

    it.each([
      ['un documento de Word antiguo', ole2, 'acta.doc'],
      ['una hoja de Excel antigua', ole2, 'notas.xls'],
      ['una presentación antigua', ole2, 'charla.ppt'],
      ['un RAR', rar, 'anexos.rar'],
      ['un vídeo MP4', mp4, 'practica.mp4'],
      ['un texto en UTF-8', Buffer.from('Nombre;Ciudad\nÁngela;Bogotá\n'), 'lista.csv'],
    ])('acepta %s', async (_case, content, name) => {
      await expect(upload(content, name)).resolves.toMatch(/^recursos\//);
    });

    it('rechaza un archivo más corto que su firma', async () => {
      await expect(upload(Buffer.from('%PD'), 'informe.pdf')).rejects.toThrow(/no corresponde/);
    });

    it('rechaza un texto con bytes nulos o con cabecera de ejecutable de Linux', async () => {
      await expect(upload(Buffer.from('hola\u0000mundo'), 'notas.txt')).rejects.toThrow(/no corresponde/);
      await expect(upload(Buffer.from('\x7fELF texto', 'latin1'), 'notas.txt')).rejects.toThrow(/no corresponde/);
    });

    it('sólo admite como entrega lo que ofrece el formulario del alumno', async () => {
      await expect(upload(Buffer.from('a;b\n'), 'datos.csv', 'entregas')).rejects.toThrow(
        /En las entregas sólo se admiten estos formatos/,
      );
      await expect(upload(Buffer.from('<svg/>'), 'dibujo.svg', 'entregas')).rejects.toThrow(BadRequestException);
    });

    it('sirve los textos declarando UTF-8', async () => {
      const key = await upload(Buffer.from('Ángela'), 'nombre.txt');
      const file = await service.openStream(key);
      file?.stream.destroy();

      expect(file?.contentType).toBe('text/plain; charset=utf-8');
    });
  });

  describe('descarga por fragmentos', () => {
    const service = createService();
    const content = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from('0123456789')]);
    let key: string;
    let tempFile: string;

    beforeAll(async () => {
      tempFile = path.join(os.tmpdir(), `prueba-${crypto.randomUUID()}`);
      fs.writeFileSync(tempFile, content);
      key = await service.uploadFromDisk(tempFile, 'manual.pdf', 'recursos', UPLOADER);
    });
    afterAll(async () => {
      fs.rmSync(tempFile, { force: true });
      await service.deleteFile(key);
    });

    async function read(stream: NodeJS.ReadableStream): Promise<string> {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
      return Buffer.concat(chunks).toString('latin1');
    }

    it('conoce el tamaño del archivo', async () => {
      expect(await service.fileSize(key)).toBe(content.length);
      expect(await service.fileSize('recursos/no-existe.pdf')).toBeNull();
    });

    it('envía sólo el fragmento pedido y declara su tamaño', async () => {
      const file = await service.openStream(key, { start: 4, end: 7 });

      expect(file?.size).toBe(4);
      expect(await read(file!.stream)).toBe('0123');
    });
  });

  describe('Cloudflare R2', () => {
    it('sube los flujos sin la suma de verificación al final, que R2 rechaza', async () => {
      const silenced = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const service = createService({
        R2_ACCOUNT_ID: 'cuenta',
        R2_ACCESS_KEY_ID: 'clave',
        R2_SECRET_ACCESS_KEY: 'secreto',
      });
      silenced.mockRestore();
      const { config } = (service as unknown as { s3: S3Client }).s3;

      expect(await config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
      expect(await config.responseChecksumValidation()).toBe('WHEN_REQUIRED');
    });
  });

  describe('claves que llegan de fuera', () => {
    const service = createService();

    it('no borra un fichero fuera del almacenamiento aunque la clave lo intente', async () => {
      // Una clave así puede acabar en una columna si un DTO no la valida.
      const outside = path.join(os.tmpdir(), `victima-${crypto.randomUUID()}.txt`);
      fs.writeFileSync(outside, 'no me borres');
      const uploads = path.resolve(__dirname, '..', '..', 'uploads');
      const traversal = `recursos/${path.relative(path.join(uploads, 'recursos'), outside)}`;
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      try {
        await service.deleteFile(traversal);
        await service.deleteFile(path.relative(uploads, outside));

        expect(fs.existsSync(outside)).toBe(true);
      } finally {
        fs.rmSync(outside, { force: true });
      }
    });

    it('no lee nada fuera del almacenamiento', async () => {
      expect(await service.readFile('../package.json')).toBeNull();
      expect(await service.openStream('recursos/../../package.json')).toBeNull();
    });

    it('no escribe con una clave inventada', async () => {
      await expect(service.saveWithKey('../fuera.pdf', Buffer.from('x'), 'application/pdf')).rejects.toThrow();
    });
  });
});
