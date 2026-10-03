import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import multipart from '@fastify/multipart';
import { fastify, FastifyInstance } from 'fastify';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { receiveFile } from './multipart';
import { MIB, UploadLimit, uploadLimit } from './upload-limits';

/**
 * Recepción de archivos por `multipart/form-data`.
 *
 * Se prueba contra un Fastify real con `@fastify/multipart`, igual que en producción: lo
 * que importa es que el límite de cada subida llegue al complemento, que el archivo que lo
 * supera se rechace con el mensaje del límite y que el temporal desaparezca siempre.
 */
describe('receiveFile', () => {
  const TASK_LIMIT = uploadLimit('entregas', 1, 2048);

  let tmpDir: string;
  let previousTmpDir: string | undefined;

  beforeAll(() => {
    previousTmpDir = process.env.UPLOAD_TMP_DIR;
    tmpDir = path.join(os.tmpdir(), `lms-subidas-${crypto.randomUUID()}`);
    process.env.UPLOAD_TMP_DIR = tmpDir;
  });

  afterAll(() => {
    if (previousTmpDir === undefined) delete process.env.UPLOAD_TMP_DIR;
    else process.env.UPLOAD_TMP_DIR = previousTmpDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Aplicación mínima con el tope técnico muy por encima del límite de la tarea. */
  async function createApp(limit: UploadLimit): Promise<FastifyInstance> {
    const app = fastify();
    await app.register(multipart, { limits: { fileSize: 10 * MIB, files: 1 } });

    app.post('/subir', async (request) => {
      const file = await receiveFile(request, limit);
      const { size } = await fs.promises.stat(file.filePath);
      return { name: file.name, size };
    });

    app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
      const status = error instanceof HttpException ? error.getStatus() : (error.statusCode ?? 500);
      void reply.status(status).send({ message: error.message });
    });

    await app.ready();
    return app;
  }

  function multipartBody(fileName: string, content: Buffer) {
    const boundary = `----prueba${crypto.randomUUID()}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
      payload: Buffer.concat([head, content, tail]),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
  }

  /** El complemento borra el temporal al terminar la respuesta, un instante después. */
  async function temporaryFilesLeft(): Promise<string[]> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const left = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
      if (left.length === 0) return left;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return fs.readdirSync(tmpDir);
  }

  it('acepta un archivo que mide exactamente el límite de la tarea', async () => {
    const app = await createApp(TASK_LIMIT);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/subir',
        ...multipartBody('informe.pdf', Buffer.alloc(MIB)),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ name: 'informe.pdf', size: MIB });
      expect(await temporaryFilesLeft()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('rechaza con el mensaje del límite un archivo que lo supera por un byte, y no deja temporal', async () => {
    const app = await createApp(TASK_LIMIT);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/subir',
        ...multipartBody('informe.pdf', Buffer.alloc(MIB + 1)),
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().message).toBe('El archivo supera el límite de 1 MB de esta tarea.');
      expect(await temporaryFilesLeft()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('rechaza un archivo vacío', async () => {
    const app = await createApp(TASK_LIMIT);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/subir',
        ...multipartBody('vacio.pdf', Buffer.alloc(0)),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('El archivo está vacío.');
      expect(await temporaryFilesLeft()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('exige multipart/form-data', async () => {
    await expect(receiveFile({}, TASK_LIMIT)).rejects.toThrow(BadRequestException);
  });

  it('pide al complemento que corte en el límite exacto', async () => {
    const saveRequestFiles = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { code: 'FST_REQ_FILE_TOO_LARGE' }));

    await expect(receiveFile({ saveRequestFiles }, TASK_LIMIT)).rejects.toThrow(
      new PayloadTooLargeException(TASK_LIMIT.message),
    );
    expect(saveRequestFiles).toHaveBeenCalledWith(expect.objectContaining({ limits: { fileSize: MIB } }));
  });

  it('no da por bueno un archivo cortado aunque el complemento no avise', async () => {
    const saveRequestFiles = async () => ({
      files: [{ filename: 'informe.pdf', filepath: '/no/importa', file: { truncated: true } }],
    });

    await expect(receiveFile({ saveRequestFiles }, TASK_LIMIT)).rejects.toThrow(TASK_LIMIT.message);
  });
});
