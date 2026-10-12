import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ByteRange } from './byte-range';
import { acceptedExtension, contentTypeOf, verifyContent } from './file-formats';
import { FOLDERS, Folder, isPublicKey, isStorageKey } from './folders';
import { MIB, uploadLimit } from './upload-limits';

/** Sólo para desarrollo: en producción la aplicación se reemplaza en cada despliegue. */
const DEVELOPMENT_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

/** Archivos a medio escribir. No es una carpeta de `FOLDERS`, así que ninguna clave lo alcanza. */
const STAGING_FOLDER = '.tmp';

/** Lo que lleve más que esto a medio escribir es de un proceso que ya no existe. */
const STALE_STAGING_MS = 60 * 60 * 1000;

const FOLDER_MODE = 0o750;
const FILE_MODE = 0o640;

const SIGNED_URL_VALIDITY_S = 60 * 60;

const OUT_OF_SPACE_CODES = ['ENOSPC', 'EDQUOT'];
const NOT_WRITABLE_CODES = ['EACCES', 'EPERM', 'EROFS'];

/** Quien sube un archivo, tal y como queda anotado en el registro de subidas. */
export type Uploader = Pick<JwtPayload, 'sub' | 'country'>;

/** Archivo listo para enviarse sin pasar entero por memoria. `size` son los bytes del flujo. */
interface FileStream {
  stream: Readable;
  contentType: string;
  size: number;
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? '';
}

function toMb(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

/**
 * Archivos del campus en el disco del servidor, bajo `STORAGE_DIR`.
 *
 * La clave de un archivo (`carpeta/nombre`) es su ruta relativa a esa raíz. Una clave que no
 * tenga esa forma no se lee, no se escribe y no se borra.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;
  private readonly staging: string;
  private readonly rootIsConfigured: boolean;
  private readonly isProduction: boolean;
  private readonly signingSecret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const configuredRoot = config.get<string>('STORAGE_DIR')?.trim();
    this.rootIsConfigured = Boolean(configuredRoot);
    this.root = path.resolve(configuredRoot || DEVELOPMENT_ROOT);
    this.staging = path.join(this.root, STAGING_FOLDER);
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    // El secreto del JWT ya es obligatorio y se valida al arrancar.
    this.signingSecret = config.get<string>('STORAGE_SECRET') || config.get<string>('JWT_SECRET') || '';
  }

  /** Prepara las carpetas y avisa si no se puede escribir, sin impedir que la API arranque. */
  async onModuleInit(): Promise<void> {
    if (!this.rootIsConfigured && this.isProduction) {
      this.logger.warn(
        `STORAGE_DIR no está definida: los archivos se guardan en ${this.root}, dentro de la aplicación, y un despliegue puede borrarlos.`,
      );
    }

    try {
      await this.createFolders();
      await this.discardStaleStaging();
    } catch (error) {
      this.logger.error(`No se pudieron preparar las carpetas de archivos en ${this.root}`, error);
    }

    if (await this.isWritable()) {
      this.logger.log(`Archivos en ${this.root}`);
    } else {
      this.logger.error(`No se puede escribir en ${this.root}: revisa STORAGE_DIR, sus permisos y el espacio libre.`);
    }
  }

  /** Comprueba de verdad que se puede escribir: un disco lleno también falla aquí. */
  async isWritable(): Promise<boolean> {
    const probe = path.join(this.staging, `sonda-${crypto.randomUUID()}`);
    try {
      await fs.promises.mkdir(this.staging, { recursive: true, mode: FOLDER_MODE });
      await fs.promises.writeFile(probe, 'ok');
      return true;
    } catch {
      return false;
    } finally {
      await fs.promises.rm(probe, { force: true }).catch(() => undefined);
    }
  }

  private async createFolders(): Promise<void> {
    await Promise.all(
      [...FOLDERS, STAGING_FOLDER].map((folder) =>
        fs.promises.mkdir(path.join(this.root, folder), { recursive: true, mode: FOLDER_MODE }),
      ),
    );
  }

  private async discardStaleStaging(): Promise<void> {
    const staleBefore = Date.now() - STALE_STAGING_MS;
    const entries = await fs.promises.readdir(this.staging);

    await Promise.all(
      entries.map(async (name) => {
        const entry = path.join(this.staging, name);
        const info = await fs.promises.stat(entry).catch(() => null);
        if (info && info.mtimeMs < staleBefore) await fs.promises.rm(entry, { recursive: true, force: true });
      }),
    );
  }

  // ── Escritura ────────────────────────────────────────────────────────────

  /**
   * Guarda un archivo recibido en disco, anota quién lo subió y devuelve su clave. No pasa
   * por memoria: se leen sólo sus primeros bytes para reconocer el formato.
   *
   * @param uploader Sólo esa persona podrá guardar la clave en una fila (`FileOwnershipService`).
   * @param maxBytes Límite de la operación: el de la tarea o el general de la sede.
   * @throws BadRequestException si el formato no se admite o el contenido no corresponde a la extensión.
   * @throws PayloadTooLargeException si excede el límite.
   */
  async uploadFromDisk(
    sourcePath: string,
    originalName: string,
    folder: Folder,
    uploader: Uploader,
    maxBytes?: number,
  ): Promise<string> {
    const extension = acceptedExtension(originalName, folder);

    const { size } = await fs.promises.stat(sourcePath);
    const limit = uploadLimit(folder, maxBytes === undefined ? undefined : maxBytes / MIB);
    if (size > limit.bytes) throw new PayloadTooLargeException(limit.message);

    await verifyContent(sourcePath, extension);

    const key = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    await this.writeAtomically(key, (stagedPath) => fs.promises.copyFile(sourcePath, stagedPath));
    this.logger.log(`Guardado: ${key} (${toMb(size)} MB)`);

    await this.register(key, folder, uploader);
    return key;
  }

  /** Un archivo sin anotar no podría guardarlo nadie en una fila, así que si la anotación falla se retira. */
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

  /** Guarda un archivo generado por el servidor, como el PDF de un certificado, con una clave ya decidida. */
  async saveWithKey(key: string, content: Buffer): Promise<void> {
    await this.writeAtomically(key, (stagedPath) => fs.promises.writeFile(stagedPath, content));
    this.logger.log(`Guardado: ${key} (${toMb(content.length)} MB)`);
  }

  /**
   * Escribe en `.tmp` y renombra al destino, que está en el mismo volumen: el archivo aparece con
   * su nombre definitivo sólo cuando está entero, aunque el proceso se corte a mitad.
   */
  private async writeAtomically(key: string, write: (stagedPath: string) => Promise<void>): Promise<void> {
    const target = this.pathOf(key);
    if (!target) throw new Error(`Clave de almacenamiento no válida: ${key}`);

    const stagedPath = path.join(this.staging, crypto.randomUUID());
    try {
      await fs.promises.mkdir(this.staging, { recursive: true, mode: FOLDER_MODE });
      await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: FOLDER_MODE });
      await write(stagedPath);
      await fs.promises.chmod(stagedPath, FILE_MODE);
      await fs.promises.rename(stagedPath, target);
    } catch (error) {
      // Si tampoco se puede borrar, lo retira el siguiente arranque.
      await fs.promises.rm(stagedPath, { force: true }).catch(() => undefined);
      throw this.writeFailure(error, key);
    }
  }

  /** Un disco lleno o sin permisos no es un fallo de programación: se dice qué pasa y a quién avisar. */
  private writeFailure(error: unknown, key: string): unknown {
    const code = errorCode(error);
    if (OUT_OF_SPACE_CODES.includes(code)) {
      this.logger.error(`Sin espacio en ${this.root} para guardar ${key} (${code})`);
      return new HttpException(
        'No queda espacio en el servidor para guardar el archivo. Avisa al administrador de la plataforma.',
        HttpStatus.INSUFFICIENT_STORAGE,
      );
    }
    if (NOT_WRITABLE_CODES.includes(code)) {
      this.logger.error(`No se puede escribir en ${this.root} para guardar ${key} (${code})`);
      return new ServiceUnavailableException(
        'El almacenamiento de archivos no está disponible. Avisa al administrador de la plataforma.',
      );
    }
    return error;
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  /** Tamaño en bytes, o `null` si el archivo no existe. */
  async fileSize(key: string): Promise<number | null> {
    const filePath = this.pathOf(key);
    if (!filePath) return null;
    const info = await this.statFile(filePath, key);
    return info?.size ?? null;
  }

  /**
   * Abre un archivo —o el fragmento indicado— para enviarlo sin cargarlo en memoria.
   * @param range Fragmento ya validado contra el tamaño del archivo (`parseByteRange`).
   * @returns `null` si el archivo no existe.
   */
  async openStream(key: string, range?: ByteRange): Promise<FileStream | null> {
    const filePath = this.pathOf(key);
    if (!filePath) return null;
    const info = await this.statFile(filePath, key);
    if (!info) return null;

    return {
      stream: fs.createReadStream(filePath, range),
      contentType: contentTypeOf(key),
      size: range ? range.end - range.start + 1 : info.size,
    };
  }

  /** Contenido entero, para manipularlo (incrustar una imagen en un PDF); para servirlo está `openStream`. */
  async readFile(key: string): Promise<Buffer | null> {
    const filePath = this.pathOf(key);
    if (!filePath) return null;
    try {
      return await fs.promises.readFile(filePath);
    } catch (error) {
      this.warnUnlessMissing(error, key);
      return null;
    }
  }

  private async statFile(filePath: string, key: string): Promise<fs.Stats | null> {
    try {
      const info = await fs.promises.stat(filePath);
      return info.isFile() ? info : null;
    } catch (error) {
      this.warnUnlessMissing(error, key);
      return null;
    }
  }

  private warnUnlessMissing(error: unknown, key: string): void {
    if (errorCode(error) !== 'ENOENT') this.logger.warn(`No se pudo leer ${key}: ${(error as Error)?.message}`);
  }

  // ── Borrado ──────────────────────────────────────────────────────────────

  /**
   * Borra archivos del disco y del registro de subidas. No falla nunca: lo que no se pueda
   * borrar queda en el registro del servidor. Para retirar sólo lo que ya no usa nadie está
   * `FileOwnershipService.deleteUnreferenced`.
   */
  async deleteFiles(keys: (string | null | undefined)[]): Promise<void> {
    const deleted: string[] = [];
    for (const key of new Set(keys)) {
      if (!key) continue;
      const filePath = this.pathOf(key);
      if (!filePath) {
        this.logger.warn(`No se borra "${key}": no es una clave de almacenamiento válida.`);
        continue;
      }
      try {
        await fs.promises.rm(filePath, { force: true });
        deleted.push(key);
      } catch (error) {
        this.logger.warn(`No se pudo borrar el archivo ${key}`, error);
      }
    }
    if (deleted.length === 0) return;

    try {
      await this.prisma.storedFile.deleteMany({ where: { key: { in: deleted } } });
    } catch (error) {
      this.logger.warn(`Borrados del disco, pero no del registro de subidas: ${deleted.join(', ')}`, error);
    }
    this.logger.log(`Borrados: ${deleted.join(', ')}`);
  }

  // ── URLs ─────────────────────────────────────────────────────────────────

  /**
   * URL con la que el navegador pide el archivo. Los reservados llevan una firma que caduca,
   * para que una URL filtrada deje de funcionar sola.
   *
   * @param originalName Nombre del archivo descargado; no forma parte de la firma.
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

  isValidSignature(key: string, exp: string | undefined, sig: string | undefined): boolean {
    const expiresAt = Number(exp);
    if (!sig || !Number.isFinite(expiresAt)) return false;
    if (expiresAt * 1000 < Date.now()) return false;

    const expected = Buffer.from(this.sign(key, expiresAt));
    const received = Buffer.from(sig);
    // En tiempo constante: medir respuestas no revela la firma.
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private sign(key: string, expiresAt: number): string {
    return crypto.createHmac('sha256', this.signingSecret).update(`${key}:${expiresAt}`).digest('hex');
  }

  /** Ruta en disco de una clave, o `null` si la clave no es válida o saldría de la raíz. */
  private pathOf(key: unknown): string | null {
    if (!isStorageKey(key)) return null;
    const filePath = path.resolve(this.root, key);
    return filePath.startsWith(this.root + path.sep) ? filePath : null;
  }
}
