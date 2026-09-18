import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/** Archivo recibido por `multipart/form-data`, ya materializado en memoria. */
export interface ArchivoSubido {
  readonly nombre: string;
  readonly contenido: Buffer;
  readonly mimetype?: string;
}

interface PeticionConArchivo {
  file?: () => Promise<{
    filename?: string;
    mimetype?: string;
    file: AsyncIterable<Buffer> & { truncated?: boolean };
  } | null>;
}

/**
 * Lee el único archivo de una petición `multipart/form-data`.
 *
 * Esta lógica estaba copiada en tres controladores con pequeñas diferencias en la
 * comprobación de errores. Aquí se hace una sola vez y con todos los casos cubiertos:
 * petición sin archivo, archivo vacío y archivo que excede el límite del servidor.
 *
 * @throws BadRequestException si no llega archivo o llega vacío.
 * @throws PayloadTooLargeException si Fastify cortó la lectura por tamaño.
 */
export async function leerArchivoDeLaPeticion(peticion: unknown): Promise<ArchivoSubido> {
  const req = peticion as PeticionConArchivo;
  if (typeof req?.file !== 'function') {
    throw new BadRequestException('La petición debe enviarse como multipart/form-data.');
  }

  const parte = await req.file();
  if (!parte) {
    throw new BadRequestException('No se recibió ningún archivo. Adjunta el archivo en el campo "file".');
  }

  const trozos: Buffer[] = [];
  for await (const trozo of parte.file) {
    trozos.push(trozo);
  }

  // Fastify marca `truncated` cuando el archivo supera el límite configurado y deja de
  // leer. Sin esta comprobación se guardaría un archivo cortado dándolo por bueno.
  if (parte.file.truncated) {
    throw new PayloadTooLargeException('El archivo supera el tamaño máximo permitido.');
  }

  const contenido = Buffer.concat(trozos);
  if (contenido.length === 0) {
    throw new BadRequestException('El archivo está vacío.');
  }

  return {
    nombre: parte.filename?.trim() || 'archivo.bin',
    contenido,
    mimetype: parte.mimetype,
  };
}
