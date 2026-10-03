import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ByteRange } from './byte-range';
import { Folder, FORMATS_BY_FOLDER, isPublicKey, isStorageKey } from './folders';
import { MIB, uploadLimit } from './upload-limits';

/**
 * Directorio de los archivos cuando no hay R2: `apps/api/uploads`, resuelto desde este
 * fichero y no desde el directorio de trabajo, que depende de dónde se lance el proceso.
 * Vale igual para `src/storage` (pruebas) que para `dist/storage` (producción).
 */
const LOCAL_DIRECTORY = path.resolve(__dirname, '..', '..', 'uploads');

/** Extensiones admitidas y su tipo MIME. Lo que no esté aquí no se sube. */
const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  // Un SVG puede llevar scripts dentro. Se admite porque los logotipos suelen venir en
  // este formato, pero el controlador lo sirve con una CSP que impide su ejecución
  // (`StorageController.securityHeaders`).
  '.svg': 'image/svg+xml',
};

/**
 * Formatos que sólo son seguros con cabeceras de contención adicionales. El controlador de
 * descargas les añade una CSP que impide ejecutar lo que lleven dentro.
 */
export const ACTIVE_CONTENT_FORMATS = ['.svg'] as const;

/** Bytes que identifican un formato y la posición del archivo en la que aparecen. */
interface FileSignature {
  readonly offset: number;
  readonly bytes: readonly number[];
}

/** Firma al principio del archivo, que es donde la llevan casi todos los formatos. */
const leading = (...bytes: number[]): FileSignature => ({ offset: 0, bytes });

const ZIP = leading(0x50, 0x4b, 0x03, 0x04);
/** Contenedor de la ofimática anterior a 2007 (.doc, .xls, .ppt). */
const OLE2 = leading(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

/**
 * Firmas de archivo conocidas, para detectar un binario renombrado. Basta con que coincida
 * una de las de su extensión, y un archivo más corto que su firma no la tiene.
 */
const FILE_SIGNATURES: Readonly<Record<string, readonly FileSignature[]>> = {
  '.pdf': [leading(0x25, 0x50, 0x44, 0x46)],
  '.png': [leading(0x89, 0x50, 0x4e, 0x47)],
  '.jpg': [leading(0xff, 0xd8, 0xff)],
  '.jpeg': [leading(0xff, 0xd8, 0xff)],
  '.gif': [leading(0x47, 0x49, 0x46, 0x38)],
  '.webp': [leading(0x52, 0x49, 0x46, 0x46)],
  '.zip': [ZIP, leading(0x50, 0x4b, 0x05, 0x06)],
  // Los formatos de Office modernos son ZIP por dentro, de ahí la misma firma.
  '.docx': [ZIP],
  '.xlsx': [ZIP],
  '.pptx': [ZIP],
  '.doc': [OLE2],
  '.xls': [OLE2],
  '.ppt': [OLE2],
  '.rar': [leading(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)],
  // MP4 y MOV declaran su formato en la caja `ftyp`, tras los cuatro bytes de su tamaño.
  '.mp4': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
  '.mp3': [leading(0x49, 0x44, 0x33), leading(0xff, 0xfb), leading(0xff, 0xf3), leading(0xff, 0xf2)],
};

/** Bytes de cabecera que basta leer para reconocer cualquiera de los formatos anteriores. */
const FILE_SIGNATURE_LENGTH = Math.max(
  ...Object.values(FILE_SIGNATURES).flatMap((signatures) => signatures.map((s) => s.offset + s.bytes.length)),
);

/** Formatos de texto: no tienen firma, pero un binario renombrado se delata en su contenido. */
const TEXT_FORMATS = ['.txt', '.csv'];

/** Lo que se examina de un archivo de texto: suficiente para delatar un binario. */
const TEXT_SAMPLE_LENGTH = 8 * 1024;

/** Ejecutables de Windows (MZ) y de Linux (ELF). */
const EXECUTABLE_SIGNATURES = [leading(0x4d, 0x5a), leading(0x7f, 0x45, 0x4c, 0x46)];

function hasSignature(header: Buffer, { offset, bytes }: FileSignature): boolean {
  return header.length >= offset + bytes.length && bytes.every((byte, i) => header[offset + i] === byte);
}

/** Un texto no lleva bytes nulos ni empieza como un ejecutable. */
function looksLikeText(sample: Buffer): boolean {
  return !sample.includes(0) && !EXECUTABLE_SIGNATURES.some((signature) => hasSignature(sample, signature));
}

/** Vigencia de una URL firmada. Suficiente para abrir o descargar el archivo. */
const SIGNED_URL_VALIDITY_S = 60 * 60;

/** Archivo recuperado del almacenamiento remoto. */
interface RemoteFile {
  content: Buffer;
  contentType: string;
}

/** Quien sube un archivo, tal y como queda anotado en el registro de subidas. */
export type Uploader = Pick<JwtPayload, 'sub' | 'country'>;

/**
 * Archivo listo para enviarse sin pasar por la memoria del servidor.
 *
 * `size` son los bytes del flujo —los del fragmento, si se pidió uno— y es nulo cuando el
 * destino no lo declara; sirve para la cabecera `Content-Length`, que es lo que permite al
 * navegador enseñar una barra de progreso.
 */
interface FileStream {
  stream: Readable;
  contentType: string;
  size: number | null;
}

/**
 * Almacenamiento de archivos con dos destinos posibles: Cloudflare R2 si está configurado
 * y el disco local en caso contrario.
 *
 * La clave de un archivo es siempre `carpeta/nombre` y es idéntica en los dos destinos, de
 * modo que la base de datos guarda lo mismo sea cual sea el destino. Una clave que no tenga
 * esa forma no se lee, no se escribe y no se borra.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly signingSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    fs.mkdirSync(LOCAL_DIRECTORY, { recursive: true });

    this.bucket = this.config.get<string>('R2_BUCKET_NAME') ?? 'lms-uploads';
    this.publicUrl = (this.config.get<string>('R2_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    // Las URLs firmadas usan su propio secreto si existe; si no, el del JWT, que ya es
    // obligatorio y se valida al arrancar.
    this.signingSecret = this.config.get<string>('STORAGE_SECRET') || this.config.get<string>('JWT_SECRET') || '';

    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        // Con el valor por defecto el SDK sube los flujos con suma de verificación al final
        // (`aws-chunked`), que R2 rechaza. Sólo se calcula cuando la operación lo exige.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
      this.logger.log('Almacenamiento en Cloudflare R2');
    } else {
      this.logger.warn(
        'R2 no configurado: los archivos se guardan en disco local. En cPanel es válido si el directorio persiste entre despliegues.',
      );
    }
  }

  // ── Subida ───────────────────────────────────────────────────────────────

  /**
   * Guarda un archivo, anota quién lo subió y devuelve su clave (`carpeta/nombre`).
   *
   * El archivo no pasa por memoria: se mide en disco, se leen sólo sus primeros bytes para
   * reconocer el formato y se copia como flujo a su destino.
   *
   * @param uploader Quien lo sube. Sólo esa persona podrá guardar la clave en un curso, un
   *        recurso o una firma (`FileOwnershipService`).
   * @param maxBytes Límite exacto de la operación: el de la tarea o el general de la sede.
   *        Las imágenes tienen el suyo fijo y nada supera el tope técnico (`upload-limits.ts`).
   * @throws BadRequestException si la extensión no está admitida o el contenido no
   *         corresponde a la extensión.
   * @throws PayloadTooLargeException si excede el límite, con un mensaje que lo nombra.
   */
  async uploadFromDisk(
    sourcePath: string,
    originalName: string,
    folder: Folder,
    uploader: Uploader,
    maxBytes?: number,
  ): Promise<string> {
    const { extension, contentType } = this.allowedFormat(originalName);

    const folderFormats = FORMATS_BY_FOLDER[folder];
    if (folderFormats && !folderFormats.includes(extension)) {
      const subject =
        folder === 'entregas' ? 'En las entregas sólo se admiten estos formatos' : 'Aquí sólo se admiten imágenes';
      throw new BadRequestException(`${subject}: ${folderFormats.join(', ')}.`);
    }

    const { size } = await fs.promises.stat(sourcePath);
    const limit = uploadLimit(folder, maxBytes === undefined ? undefined : maxBytes / MIB);
    if (size > limit.bytes) {
      throw new PayloadTooLargeException(limit.message);
    }

    await this.verifyFileSignature(sourcePath, extension);

    const key = this.newKey(folder, extension);
    await this.copy(sourcePath, key, contentType, size);
    await this.register(key, folder, uploader);
    return key;
  }

  /**
   * Anota la subida en el registro. Un archivo sin anotar no podría guardarlo nadie, así que
   * si la anotación falla se retira.
   */
  private async register(key: string, folder: Folder, uploader: Uploader): Promise<void> {
    try {
      await this.prisma.storedFile.create({
        data: { key, folder, uploaderGuid: uploader.sub, country: uploader.country },
      });
    } catch (error) {
      await this.deleteFiles([key]);
      throw error;
    }
  }

  /** Extensión y tipo MIME de un nombre de archivo, si está entre los admitidos. */
  private allowedFormat(originalName: string): { extension: string; contentType: string } {
    const extension = path.extname(originalName).toLowerCase();
    const contentType = ALLOWED_TYPES[extension];

    if (!contentType) {
      throw new BadRequestException(
        `No se admiten archivos "${extension || 'sin extensión'}". Formatos válidos: ${Object.keys(ALLOWED_TYPES).join(', ')}.`,
      );
    }
    return { extension, contentType };
  }

  /** Nombre imposible de adivinar, con la extensión que declara el archivo. */
  private newKey(folder: Folder, extension: string): string {
    return `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  }

  /** Lleva el archivo recibido a su destino definitivo sin cargarlo en memoria. */
  private async copy(sourcePath: string, key: string, contentType: string, size: number): Promise<void> {
    if (this.s3) {
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: fs.createReadStream(sourcePath),
            // R2 exige saber el tamaño por adelantado cuando el cuerpo es un flujo.
            ContentLength: size,
            ContentType: contentType,
          }),
        );
      } catch (error) {
        this.logger.error(`No se pudo guardar en R2: ${key} (${this.toMb(size)} MB)`, (error as Error)?.stack);
        throw new ServiceUnavailableException(
          'No se pudo guardar el archivo en el almacenamiento. Inténtalo de nuevo en unos minutos.',
        );
      }
      this.logger.log(`Guardado en R2: ${key} (${this.toMb(size)} MB)`);
      return;
    }

    const target = this.localPath(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });

    // Se copia a un nombre provisional y se renombra al final.
    //
    // `copyFile` en lugar de `rename` desde el temporal porque el directorio temporal del
    // sistema puede estar en otro volumen, y ahí `rename` falla con EXDEV. Pero copiar no
    // es atómico: si el proceso se corta a media copia, en el destino quedaría un archivo
    // truncado con pinta de bueno. Renombrar dentro del mismo directorio sí lo es, así que
    // el archivo aparece con su nombre definitivo sólo cuando está entero.
    const tempPath = `${target}.parcial`;
    try {
      await fs.promises.copyFile(sourcePath, tempPath);
      await fs.promises.rename(tempPath, target);
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true });
      throw error;
    }

    this.logger.log(`Guardado en disco: ${key} (${this.toMb(size)} MB)`);
  }

  /** Guarda un archivo con una clave ya decidida (certificados generados por el servidor). */
  async saveWithKey(key: string, content: Buffer, contentType: string): Promise<void> {
    if (!isStorageKey(key)) {
      throw new Error(`Clave de almacenamiento no válida: ${key}`);
    }

    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content, ContentType: contentType }),
      );
      this.logger.log(`Guardado en R2: ${key} (${this.toMb(content.length)} MB)`);
      return;
    }

    const target = this.localPath(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, content);
    this.logger.log(`Guardado en disco: ${key} (${this.toMb(content.length)} MB)`);
  }

  /**
   * Comprueba que el contenido del archivo corresponda a su extensión.
   * Impide subir un ejecutable renombrado como `.pdf` o como `.txt`.
   *
   * Sólo se lee la cabecera —unos pocos bytes, o unos KB en un texto—, no el archivo entero.
   */
  private async verifyFileSignature(filePath: string, extension: string): Promise<void> {
    const signatures = FILE_SIGNATURES[extension];
    const isText = TEXT_FORMATS.includes(extension);
    if (!signatures && !isText) return;

    const header = await this.readHeader(filePath, isText ? TEXT_SAMPLE_LENGTH : FILE_SIGNATURE_LENGTH);
    const valid = signatures ? signatures.some((signature) => hasSignature(header, signature)) : looksLikeText(header);
    if (!valid) {
      throw new BadRequestException(
        `El contenido del archivo no corresponde a un ${extension}. Puede estar dañado o tener la extensión cambiada.`,
      );
    }
  }

  /** Los primeros bytes de un archivo, o menos si es más corto. */
  private async readHeader(filePath: string, length: number): Promise<Buffer> {
    const file = await fs.promises.open(filePath, 'r');
    try {
      const header = Buffer.alloc(length);
      const { bytesRead } = await file.read(header, 0, length, 0);
      return header.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  /** Tamaño de un archivo en bytes, o `null` si no existe en el destino activo. */
  async fileSize(key: string): Promise<number | null> {
    if (!isStorageKey(key)) return null;

    if (this.s3) {
      try {
        const response = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return response.ContentLength ?? null;
      } catch {
        return null;
      }
    }

    try {
      const info = await fs.promises.stat(this.localPath(key));
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  /**
   * Abre un archivo —o el fragmento indicado— para enviarlo tal cual, sin cargarlo entero
   * en memoria.
   *
   * Es la forma de servir descargas: cada descarga ocupa el tamaño de un trozo, no el del
   * archivo. `readFile()` sólo tiene sentido cuando hay que **manipular** el contenido
   * —incrustar un logotipo en un PDF, por ejemplo—.
   *
   * @param range Fragmento ya validado contra el tamaño del archivo (`parseByteRange`).
   * @returns `null` si el archivo no existe en el destino activo.
   */
  async openStream(key: string, range?: ByteRange): Promise<FileStream | null> {
    if (!isStorageKey(key)) return null;

    if (this.s3) {
      try {
        const response = await this.s3.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ...(range && { Range: `bytes=${range.start}-${range.end}` }),
          }),
        );
        if (!response.Body) return null;

        return {
          stream: response.Body as Readable,
          contentType: response.ContentType ?? this.contentTypeOf(key),
          size: response.ContentLength ?? null,
        };
      } catch (error) {
        this.logger.warn(`No se pudo abrir en R2: ${key} — ${(error as Error)?.message}`);
        return null;
      }
    }

    const filePath = this.localPath(key);
    try {
      const info = await fs.promises.stat(filePath);
      if (!info.isFile()) return null;

      return {
        stream: fs.createReadStream(filePath, range),
        contentType: this.contentTypeOf(key),
        size: range ? range.end - range.start + 1 : info.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Recupera un archivo entero. Devuelve `null` si no existe en el destino activo.
   * Para servir descargas está `openStream()`, que no lo retiene en memoria.
   */
  async readFile(key: string): Promise<RemoteFile | null> {
    if (!isStorageKey(key)) return null;

    if (this.s3) {
      try {
        const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!response.Body) return null;

        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);

        return {
          content: Buffer.concat(chunks),
          contentType: response.ContentType ?? this.contentTypeOf(key),
        };
      } catch (error) {
        this.logger.warn(`No se pudo leer de R2: ${key} — ${(error as Error)?.message}`);
        return null;
      }
    }

    try {
      return { content: await fs.promises.readFile(this.localPath(key)), contentType: this.contentTypeOf(key) };
    } catch {
      return null;
    }
  }

  // ── Borrado ──────────────────────────────────────────────────────────────

  /**
   * Elimina un archivo del destino activo y su anotación en el registro de subidas. No
   * falla si ya no existe.
   *
   * No mira si alguna fila lo sigue usando: para retirar lo sustituido o lo que deja de
   * usarse está `FileOwnershipService.deleteUnreferenced`.
   */
  async deleteFile(key: string | null | undefined): Promise<void> {
    if (!key) return;
    if (!isStorageKey(key)) {
      this.logger.warn(`No se borra "${key}": no es una clave de almacenamiento válida.`);
      return;
    }

    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.log(`Borrado de R2: ${key}`);
    } else {
      await fs.promises.rm(this.localPath(key), { force: true });
      this.logger.log(`Borrado de disco: ${key}`);
    }

    await this.prisma.storedFile.deleteMany({ where: { key } });
  }

  /**
   * Borra varios archivos sin interrumpirse por los que fallen.
   *
   * Se usa como limpieza tras eliminar un curso, un recurso o una cuenta: el registro ya
   * desapareció de la base, así que un archivo que no se pueda borrar no es motivo para
   * deshacer la operación ni para devolver un error a quien la pidió. Queda en el registro
   * del servidor, porque nada lo retirará después: no hay limpieza automática de archivos.
   */
  async deleteFiles(keys: (string | null | undefined)[]): Promise<void> {
    for (const key of keys) {
      if (!key) continue;
      try {
        await this.deleteFile(key);
      } catch (error) {
        this.logger.warn(`No se pudo borrar el archivo ${key}`, error);
      }
    }
  }

  // ── URLs ─────────────────────────────────────────────────────────────────

  /**
   * URL con la que el navegador puede pedir el archivo.
   *
   * Los archivos de marca se sirven sin más; los reservados —entregas, certificados,
   * firmas y material de curso— llevan una firma con caducidad, de modo que una URL
   * filtrada deja de funcionar sola en lugar de quedar accesible indefinidamente.
   *
   * @param originalName Nombre con el que se guarda la descarga; sin él, el navegador usa
   *        la clave, que es un nombre aleatorio. No forma parte de la firma: cambiarlo sólo
   *        cambia cómo se llama el archivo descargado.
   */
  downloadUrl(key: string, originalName?: string | null): string {
    const params: string[] = [];
    if (!isPublicKey(key)) {
      const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_VALIDITY_S;
      params.push(`exp=${expiresAt}`, `sig=${this.sign(key, expiresAt)}`);
    }
    if (originalName) params.push(`originalName=${encodeURIComponent(originalName)}`);

    return `/api/storage/download/${key}${params.length > 0 ? `?${params.join('&')}` : ''}`;
  }

  /** Comprueba la firma de una descarga reservada. */
  isValidSignature(key: string, exp: string | undefined, sig: string | undefined): boolean {
    const expiresAt = Number(exp);
    if (!sig || !Number.isFinite(expiresAt)) return false;
    if (expiresAt * 1000 < Date.now()) return false;

    const expected = Buffer.from(this.sign(key, expiresAt));
    const received = Buffer.from(sig);
    // Comparación en tiempo constante: evita deducir la firma midiendo respuestas.
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private sign(key: string, expiresAt: number): string {
    return crypto.createHmac('sha256', this.signingSecret).update(`${key}:${expiresAt}`).digest('hex');
  }

  /** URL pública directa del CDN, si está configurado. */
  directPublicUrl(key: string): string | null {
    return this.publicUrl ? `${this.publicUrl}/${key}` : null;
  }

  /** Ruta en disco de una clave ya validada con `isStorageKey`. */
  private localPath(key: string): string {
    return path.join(LOCAL_DIRECTORY, key);
  }

  private contentTypeOf(key: string): string {
    const extension = path.extname(key).toLowerCase();
    return ALLOWED_TYPES[extension] ?? 'application/octet-stream';
  }

  private toMb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
  }
}
