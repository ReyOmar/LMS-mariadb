import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as fs from 'fs';
import { UploadLimit, uploadLimit } from './upload-limits';
import { shortenFileName } from './file-name';

/**
 * Archivo recibido por `multipart/form-data`, ya escrito en un fichero temporal.
 *
 * No se expone el contenido: quien lo reciba lo entrega al almacenamiento por su ruta y
 * nunca necesita tenerlo entero en memoria.
 */
export interface ReceivedFile {
  readonly name: string;
  /** Fichero temporal. Fastify lo borra solo al terminar la petición. */
  readonly filePath: string;
}

/**
 * Recibe el archivo de la petición con el límite indicado. Permite decidir el límite —y
 * comprobar permisos— antes de leer un solo byte del archivo.
 */
export type FileReceiver = (limit: UploadLimit) => Promise<ReceivedFile>;

interface SavedPart {
  filename?: string;
  filepath: string;
  file?: { truncated?: boolean };
}

interface SaveOptions {
  limits: { fileSize: number };
  tmpdir?: string;
}

interface RequestWithFiles {
  saveRequestFiles?: (options?: SaveOptions) => Promise<{ files: SavedPart[] }>;
}

/** Código con el que `@fastify/multipart` avisa de que el archivo superó `fileSize`. */
const FILE_TOO_LARGE = 'FST_REQ_FILE_TOO_LARGE';

/**
 * Carpeta de los temporales de subida. Por defecto la del sistema, que en algunos
 * alojamientos es pequeña; `UPLOAD_TMP_DIR` permite llevarlos a una carpeta de la cuenta.
 */
async function temporaryDirectory(): Promise<string | undefined> {
  const directory = process.env.UPLOAD_TMP_DIR?.trim();
  if (!directory) return undefined;

  await fs.promises.mkdir(directory, { recursive: true });
  return directory;
}

/**
 * Recibe el único archivo de una petición `multipart/form-data`.
 *
 * El archivo se escribe directamente en disco mientras llega, en lugar de acumularse en
 * un `Buffer`: varias subidas a la vez no retienen su tamaño completo en la memoria del
 * proceso. Y se escribe sólo hasta el límite: lo que lo supere se descarta al llegar, así
 * que un archivo de 2 GB enviado a una tarea de 10 MB no ocupa más de 10 MB en disco.
 *
 * El fichero temporal lo gestiona `@fastify/multipart`, que lo borra al responder —también
 * cuando la subida se rechaza—; no hay limpieza que recordar en cada controlador.
 *
 * @param limit Límite exacto de esta subida. Sin él rige el tope técnico del servidor.
 * @throws BadRequestException si no llega archivo, llega vacío o la petición no es multipart.
 * @throws PayloadTooLargeException con el mensaje del límite si el archivo lo supera.
 */
export async function receiveFile(request: unknown, limit: UploadLimit = uploadLimit()): Promise<ReceivedFile> {
  const req = request as RequestWithFiles;
  if (typeof req?.saveRequestFiles !== 'function') {
    throw new BadRequestException('La petición debe enviarse como multipart/form-data.');
  }

  let files: SavedPart[];
  try {
    ({ files } = await req.saveRequestFiles({
      limits: { fileSize: limit.bytes },
      tmpdir: await temporaryDirectory(),
    }));
  } catch (error) {
    if ((error as { code?: unknown })?.code === FILE_TOO_LARGE) {
      throw new PayloadTooLargeException(limit.message);
    }
    throw error;
  }

  const part = files[0];
  if (!part) {
    throw new BadRequestException('No se recibió ningún archivo. Adjunta el archivo en el campo "file".');
  }

  // Si el complemento no lanzara el error, marca el archivo como cortado. Sin esta
  // comprobación se guardaría un archivo incompleto dándolo por bueno.
  if (part.file?.truncated) {
    throw new PayloadTooLargeException(limit.message);
  }

  const { size } = await fs.promises.stat(part.filepath);
  if (size === 0) {
    throw new BadRequestException('El archivo está vacío.');
  }

  // El tipo que declara el navegador no se devuelve: no es de fiar, y el almacenamiento
  // decide el formato por la extensión y por los primeros bytes del archivo. El nombre se
  // recorta a lo que cabe en la base de datos, conservando la extensión.
  return {
    name: shortenFileName(part.filename?.trim() || 'archivo.bin'),
    filePath: part.filepath,
  };
}
