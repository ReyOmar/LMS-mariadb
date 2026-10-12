import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BadRequestException, HttpStatus, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { isBrandKey, isPublicKey, isStorageKey } from './folders';

const UPLOADER = { sub: 'profe-1', country: 'COLOMBIA' as const };
const PDF = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(100)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100)]);
const HOUR_MS = 60 * 60 * 1000;

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
      deleteMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) => ({
        count: where.key.in.filter((key) => rows.delete(key)).length,
      })),
    },
  };
}

function createService(values: Record<string, string> = {}, prisma = fakeRegistry()): StorageService {
  const config = {
    get: (key: string) => ({ JWT_SECRET: 'secreto-de-pruebas-suficientemente-largo', ...values })[key],
  } as unknown as ConfigService;

  const service = new StorageService(config, prisma as never);
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(service['logger'], level).mockImplementation(() => undefined);
  }
  return service;
}

async function read(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('latin1');
}

function failure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('StorageService', () => {
  // Cada prueba trabaja en su propia carpeta temporal: nunca toca los archivos reales del campus.
  let workspace: string;
  let root: string;
  let service: StorageService;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-almacen-'));
    root = path.join(workspace, 'uploads');
    service = createService({ STORAGE_DIR: root });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** El archivo llega ya escrito en un temporal, como lo deja la subida multipart. */
  function asTempFile(content: Buffer): string {
    const filePath = path.join(workspace, `subida-${crypto.randomUUID()}`);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  const stored = (key: string) => path.join(root, key);
  const staged = () => fs.readdirSync(path.join(root, '.tmp'));

  describe('clasificación de archivos', () => {
    it('sirve sin firma el material de marca y las fotos de perfil', () => {
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

    it('sólo deja guardar en cachés compartidas el material de marca, no las fotos de perfil', () => {
      expect(isBrandKey('logos/abc.png')).toBe(true);
      expect(isBrandKey('portadas/abc.png')).toBe(true);
      expect(isBrandKey('avatars/abc.png')).toBe(false);
      expect(isBrandKey('entregas/abc.pdf')).toBe(false);
    });
  });

  describe('forma de las claves', () => {
    it('acepta las claves que genera el propio servicio', () => {
      expect(isStorageKey('entregas/1789941375380-b13c4b5df175.txt')).toBe(true);
      expect(isStorageKey('certificados/efb6b21a-8fdd-43db-a2d8-8e4abcd24813.pdf')).toBe(true);
    });

    it.each([
      ['una subida de directorio', 'recursos/..'],
      ['una ruta relativa', '../prisma/schema.prisma'],
      ['un nivel de más', 'recursos/a/b.pdf'],
      ['una barra invertida', 'recursos/..\\..\\secreto.txt'],
      ['una carpeta desconocida', 'config/a.pdf'],
      ['la carpeta de escrituras a medias', '.tmp/a.pdf'],
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
      const url = service.downloadUrl('logos/marca.png');

      expect(url).toBe('/api/storage/download/logos/marca.png');
      expect(url).not.toContain('sig=');
    });

    it('firma el material reservado y le pone caducidad', () => {
      const url = service.downloadUrl('entregas/tarea.pdf');

      expect(url).toContain('/api/storage/download/entregas/tarea.pdf');
      expect(url).toMatch(/exp=\d+/);
      expect(url).toMatch(/sig=[0-9a-f]{64}/);
    });

    it('lleva el nombre original para la descarga, fuera de la firma', () => {
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

  describe('arranque', () => {
    it('crea la raíz y sus carpetas sin permisos para otras cuentas del servidor', async () => {
      await service.onModuleInit();

      for (const folder of ['entregas', 'certificados', 'logos', 'avatars', '.tmp']) {
        expect(fs.statSync(path.join(root, folder)).mode & 0o777).toBe(0o750);
      }
    });

    it('retira las escrituras a medias de un proceso anterior, pero no las recientes', async () => {
      await service.onModuleInit();
      const abandoned = path.join(root, '.tmp', 'abandonado');
      const inProgress = path.join(root, '.tmp', 'en-curso');
      fs.writeFileSync(abandoned, 'medio');
      fs.writeFileSync(inProgress, 'medio');
      const twoHoursAgo = new Date(Date.now() - 2 * HOUR_MS);
      fs.utimesSync(abandoned, twoHoursAgo, twoHoursAgo);

      await service.onModuleInit();

      expect(staged()).toEqual(['en-curso']);
    });

    it('no impide arrancar si no se puede escribir: lo avisa y lo dice el estado de salud', async () => {
      const blocker = path.join(workspace, 'soy-un-archivo');
      fs.writeFileSync(blocker, '');
      const broken = createService({ STORAGE_DIR: path.join(blocker, 'uploads') });

      await expect(broken.onModuleInit()).resolves.toBeUndefined();
      expect(await broken.isWritable()).toBe(false);
      expect(broken['logger'].error).toHaveBeenCalledWith(expect.stringContaining('No se puede escribir'));
    });

    it('comprueba que se puede escribir sin dejar nada en el disco', async () => {
      await service.onModuleInit();

      expect(await service.isWritable()).toBe(true);
      expect(staged()).toEqual([]);
    });
  });

  describe('subida de archivos', () => {
    it('rechaza una extensión no admitida', async () => {
      await expect(service.uploadFromDisk(asTempFile(PDF), 'programa.exe', 'recursos', UPLOADER)).rejects.toThrow(
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
      const filePath = asTempFile(Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]));

      await expect(service.uploadFromDisk(filePath, 'informe.pdf', 'entregas', UPLOADER, 1024 * 1024)).rejects.toThrow(
        new PayloadTooLargeException('El archivo supera el límite de 1 MB de esta tarea.'),
      );
    });

    it('acepta un archivo que mide exactamente el límite', async () => {
      const filePath = asTempFile(Buffer.concat([PDF, Buffer.alloc(1024 * 1024 - PDF.length)]));
      const key = await service.uploadFromDisk(filePath, 'informe.pdf', 'entregas', UPLOADER, 1024 * 1024);

      expect(fs.statSync(stored(key)).size).toBe(1024 * 1024);
    });

    it('mantiene el tope fijo de las imágenes aunque se pida uno mayor', async () => {
      const png = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);

      await expect(
        service.uploadFromDisk(asTempFile(png), 'firma.png', 'firmas', UPLOADER, 50 * 1024 * 1024),
      ).rejects.toThrow('La imagen supera el límite de 2 MB.');
    });

    // Las carpetas públicas se sirven sin firma: si admitieran cualquier formato, serían un
    // alojamiento de archivos abierto desde el dominio del campus.
    it('no acepta un documento en una carpeta pública de imágenes', async () => {
      await expect(service.uploadFromDisk(asTempFile(PDF), 'foto.pdf', 'avatars', UPLOADER)).rejects.toThrow(
        /sólo se admiten imágenes/,
      );
    });

    it('no acepta una firma que el certificado no sabría imprimir', async () => {
      // Se veía bien en la vista previa del navegador y desaparecía de todos los PDF.
      const webp = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46]), Buffer.alloc(100)]);

      await expect(service.uploadFromDisk(asTempFile(webp), 'firma.webp', 'firmas', UPLOADER)).rejects.toThrow(
        /La firma tiene que ser PNG o JPG/,
      );
    });

    it('no acepta un logotipo que el certificado no sabría imprimir y dice qué formatos sirven', async () => {
      await expect(
        service.uploadFromDisk(asTempFile(Buffer.from('<svg/>')), 'logo.svg', 'logos', UPLOADER),
      ).rejects.toThrow(/El logotipo y el favicon tienen que ser PNG o JPG/);
    });

    it('acepta una imagen en una carpeta de imágenes', async () => {
      const key = await service.uploadFromDisk(asTempFile(PNG), 'foto.png', 'avatars', UPLOADER);

      expect(key).toMatch(/^avatars\/.+\.png$/);
    });

    it('guarda el archivo en su carpeta dentro de STORAGE_DIR, sin dejar temporales', async () => {
      const key = await service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER);

      expect(key).toMatch(/^entregas\/\d+-[0-9a-f]{12}\.pdf$/);
      expect(fs.readFileSync(stored(key))).toEqual(PDF);
      expect(fs.statSync(stored(key)).mode & 0o777).toBe(0o640);
      expect(staged()).toEqual([]);
    });

    it('si la copia se corta a medias, no aparece el archivo ni queda el temporal', async () => {
      jest.spyOn(fs.promises, 'copyFile').mockImplementationOnce(async (_source, destination) => {
        await fs.promises.writeFile(destination as string, 'medio archivo');
        throw failure('EIO');
      });

      await expect(service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER)).rejects.toThrow('EIO');
      expect(fs.readdirSync(path.join(root, 'entregas'))).toEqual([]);
      expect(staged()).toEqual([]);
    });

    it('con el disco lleno responde 507 con un mensaje que dice a quién avisar', async () => {
      jest.spyOn(fs.promises, 'copyFile').mockRejectedValueOnce(failure('ENOSPC'));

      const upload = service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER);

      await expect(upload).rejects.toMatchObject({
        status: HttpStatus.INSUFFICIENT_STORAGE,
        message: expect.stringContaining('No queda espacio en el servidor'),
      });
    });

    it('con la cuota agotada responde igual que con el disco lleno', async () => {
      jest.spyOn(fs.promises, 'copyFile').mockRejectedValueOnce(failure('EDQUOT'));

      await expect(service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER)).rejects.toMatchObject({
        status: HttpStatus.INSUFFICIENT_STORAGE,
      });
    });

    it.each(['EACCES', 'EROFS'])(
      'sin permiso de escritura (%s) responde 503 y lo registra con la ruta',
      async (code) => {
        jest.spyOn(fs.promises, 'copyFile').mockRejectedValueOnce(failure(code));

        await expect(service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER)).rejects.toThrow(
          ServiceUnavailableException,
        );
        expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining(root));
      },
    );
  });

  describe('archivos generados por el servidor', () => {
    it('guarda el PDF de un certificado con su clave', async () => {
      await service.saveWithKey('certificados/c1.pdf', PDF);

      expect(fs.readFileSync(stored('certificados/c1.pdf'))).toEqual(PDF);
      expect(staged()).toEqual([]);
    });

    it('un PDF a medio escribir nunca aparece con su nombre definitivo', async () => {
      jest.spyOn(fs.promises, 'writeFile').mockImplementationOnce(async (file) => {
        fs.writeFileSync(file as string, '%PDF-a medias');
        throw failure('ENOSPC');
      });

      await expect(service.saveWithKey('certificados/c1.pdf', PDF)).rejects.toMatchObject({
        status: HttpStatus.INSUFFICIENT_STORAGE,
      });
      expect(fs.existsSync(stored('certificados/c1.pdf'))).toBe(false);
      expect(staged()).toEqual([]);
    });

    it('sustituye entero un PDF que ya existía', async () => {
      await service.saveWithKey('certificados/c1.pdf', Buffer.from('%PDF-anterior'));
      await service.saveWithKey('certificados/c1.pdf', PDF);

      expect(await service.readFile('certificados/c1.pdf')).toEqual(PDF);
    });
  });

  describe('registro de subidas', () => {
    it('anota cada subida con su carpeta, quién la subió y su sede, y la retira al borrarla', async () => {
      const registry = fakeRegistry();
      const registered = createService({ STORAGE_DIR: root }, registry);

      const key = await registered.uploadFromDisk(asTempFile(PNG), 'portada.png', 'portadas', UPLOADER);

      expect(registry.rows.get(key)).toEqual({ key, folder: 'portadas', uploaderGuid: 'profe-1', country: 'COLOMBIA' });
      await registered.deleteFiles([key]);
      expect(registry.rows.has(key)).toBe(false);
    });

    it('si no se puede anotar, retira el archivo: nadie podría usarlo', async () => {
      const registry = fakeRegistry();
      registry.storedFile.create.mockRejectedValueOnce(new Error('la base no responde'));
      const registered = createService({ STORAGE_DIR: root }, registry);

      await expect(registered.uploadFromDisk(asTempFile(PNG), 'portada.png', 'portadas', UPLOADER)).rejects.toThrow(
        'la base no responde',
      );
      expect(fs.readdirSync(path.join(root, 'portadas'))).toEqual([]);
    });
  });

  describe('borrado', () => {
    it('quita el archivo del disco', async () => {
      const key = await service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER);

      await service.deleteFiles([key]);

      expect(fs.existsSync(stored(key))).toBe(false);
    });

    it('borrar dos veces, o algo que ya no está, no falla', async () => {
      const key = await service.uploadFromDisk(asTempFile(PDF), 'informe.pdf', 'entregas', UPLOADER);

      await service.deleteFiles([key, key]);
      await expect(service.deleteFiles([key, 'recursos/no-existe.pdf', null, undefined])).resolves.toBeUndefined();
    });
  });

  describe('contenido que no corresponde a la extensión', () => {
    function upload(content: Buffer, name: string, folder: 'recursos' | 'entregas' = 'recursos') {
      return service.uploadFromDisk(asTempFile(content), name, folder, UPLOADER);
    }

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

      expect(file?.contentType).toBe('text/plain; charset=utf-8');
      expect(Buffer.from(await read(file!.stream), 'latin1').toString('utf8')).toBe('Ángela');
    });
  });

  describe('lectura', () => {
    const content = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.from('0123456789')]);

    it('conoce el tamaño del archivo', async () => {
      const key = await service.uploadFromDisk(asTempFile(content), 'manual.pdf', 'recursos', UPLOADER);

      expect(await service.fileSize(key)).toBe(content.length);
      expect(await service.fileSize('recursos/no-existe.pdf')).toBeNull();
    });

    it('envía sólo el fragmento pedido y declara su tamaño', async () => {
      const key = await service.uploadFromDisk(asTempFile(content), 'manual.pdf', 'recursos', UPLOADER);
      const file = await service.openStream(key, { start: 4, end: 7 });

      expect(file?.size).toBe(4);
      expect(await read(file!.stream)).toBe('0123');
    });

    it('un archivo que no está se lee como ausente, sin avisos', async () => {
      expect(await service.readFile('certificados/perdido.pdf')).toBeNull();
      expect(await service.openStream('certificados/perdido.pdf')).toBeNull();
      expect(service['logger'].warn).not.toHaveBeenCalled();
    });
  });

  describe('claves que llegan de fuera', () => {
    it('no borra un fichero fuera del almacenamiento aunque la clave lo intente', async () => {
      // Una clave así puede acabar en una columna si un DTO no la valida.
      const outside = path.join(workspace, 'victima.txt');
      fs.writeFileSync(outside, 'no me borres');
      const traversal = `recursos/${path.relative(path.join(root, 'recursos'), outside)}`;

      await service.deleteFiles([traversal, path.relative(root, outside)]);

      expect(fs.existsSync(outside)).toBe(true);
    });

    it('no lee nada fuera del almacenamiento', async () => {
      expect(await service.readFile('../package.json')).toBeNull();
      expect(await service.openStream('recursos/../../package.json')).toBeNull();
    });

    it('no escribe con una clave inventada', async () => {
      await expect(service.saveWithKey('../fuera.pdf', PDF)).rejects.toThrow(/no válida/);
    });
  });
});
