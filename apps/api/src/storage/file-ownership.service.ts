import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Country } from '../common/domain/country';
import { StorageService } from './storage.service';
import { Folder, isStorageKey } from './folders';

/**
 * Quién puede guardar una clave nueva: quien la subió o, en la configuración de una sede
 * (logotipos, fondo), cualquier administrador de esa sede.
 */
export type KeyOwner = { uploader: string } | { country: Country };

/** Un campo de una fila que guarda la clave de un archivo ya subido. */
export interface FileFieldChange {
  folder: Folder;
  current: string | null | undefined;
  /** `null` lo quita; `undefined` lo deja como está. */
  next: string | null | undefined;
}

type MaybeKey = string | null | undefined;

/** Claves por consulta al buscar quién las usa: una lista `IN` acotada. */
const REFERENCE_BATCH = 500;

/** La clave anterior de un campo, si la operación la sustituye por otra o la quita. */
function replacedKey(current: MaybeKey, next: MaybeKey): string | null {
  return next !== undefined && current && current !== next ? current : null;
}

/**
 * Reglas para usar y retirar archivos subidos.
 *
 * Una fila sólo puede pasar a apuntar a un archivo que haya subido quien la guarda: si no,
 * bastaría con escribir la clave de un archivo ajeno para descargarlo y, al sustituirlo,
 * borrarlo. Y un archivo sólo se borra cuando ya no lo usa ninguna fila.
 */
@Injectable()
export class FileOwnershipService {
  private readonly logger = new Logger(FileOwnershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Guarda una fila que sustituye o quita archivos ya subidos y retira del almacenamiento los
   * que deja de usar. Nada se guarda si `owner` no puede usar alguna de las claves nuevas.
   */
  async replace<T>(changes: FileFieldChange[], owner: KeyOwner, save: () => Promise<T>): Promise<T> {
    for (const { next, current, folder } of changes) {
      await this.assertCanUse(next, current, folder, owner);
    }

    const saved = await save();
    await this.deleteUnreferenced(changes.map(({ current, next }) => replacedKey(current, next)));
    return saved;
  }

  /**
   * Guarda la fila que pasa a usar un archivo subido en esta misma operación y retira el que
   * usaba antes. Si no se puede guardar, retira el nuevo: ninguna fila lo usaría.
   *
   * @param previousKeyOf Clave que guardaba la fila antes de `save`.
   */
  async adoptUpload<T>(uploadedKey: string, save: () => Promise<T>, previousKeyOf: (saved: T) => MaybeKey): Promise<T> {
    let saved: T;
    try {
      saved = await save();
    } catch (error) {
      await this.storage.deleteFiles([uploadedKey]);
      throw error;
    }

    await this.deleteUnreferenced([replacedKey(previousKeyOf(saved), uploadedKey)]);
    return saved;
  }

  /**
   * Comprueba que una fila puede pasar a guardar la clave `next` en un campo de `folder`. Si la
   * clave no cambia no se revisa: los archivos anteriores al registro de subidas siguen valiendo.
   *
   * @throws BadRequestException si la clave no consta como subida o es de otra carpeta.
   * @throws ForbiddenException si la subió otra persona o es de otra sede.
   */
  async assertCanUse(next: MaybeKey, current: MaybeKey, folder: Folder, owner: KeyOwner): Promise<void> {
    if (!next || next === current) return;

    const file = await this.prisma.storedFile.findUnique({ where: { key: next } });
    if (!file || file.folder !== folder) {
      throw new BadRequestException('El archivo indicado no existe o no corresponde a este campo. Súbelo de nuevo.');
    }

    if ('uploader' in owner && file.uploaderGuid !== owner.uploader) {
      throw new ForbiddenException('Sólo puedes usar archivos que hayas subido tú. Súbelo de nuevo.');
    }
    if ('country' in owner && file.country !== owner.country) {
      throw new ForbiddenException('Ese archivo pertenece a otra sede. Súbelo de nuevo.');
    }
  }

  /**
   * Borra los archivos indicados que ya no use ninguna fila; uno puede seguir en otra (la misma
   * portada en dos cursos). Nunca falla: si no puede comprobarlo, no borra nada y lo registra.
   */
  async deleteUnreferenced(keys: MaybeKey[]): Promise<void> {
    const candidates = [...new Set(keys.filter((key): key is string => isStorageKey(key)))];
    if (candidates.length === 0) return;

    try {
      const referenced = await this.referencedKeys(candidates);
      await this.storage.deleteFiles(candidates.filter((key) => !referenced.has(key)));
    } catch (error) {
      this.logger.warn(
        `No se pudo comprobar qué archivos siguen en uso; no se borra ninguno de ${candidates.length}`,
        error,
      );
    }
  }

  private async referencedKeys(keys: string[]): Promise<Set<string>> {
    const referenced = new Set<string>();

    for (let start = 0; start < keys.length; start += REFERENCE_BATCH) {
      const among = { in: keys.slice(start, start + REFERENCE_BATCH) };

      // Una tras otra: es una limpieza, y seis a la vez ocuparían casi todo el pool de conexiones.
      const rows = [
        await this.prisma.course.findMany({ where: { coverImage: among }, select: { coverImage: true } }),
        await this.prisma.resource.findMany({
          where: { OR: [{ attachmentKey: among }, { fileUrl: among }] },
          select: { attachmentKey: true, fileUrl: true },
        }),
        await this.prisma.user.findMany({
          where: { OR: [{ photoUrl: among }, { signatureUrl: among }] },
          select: { photoUrl: true, signatureUrl: true },
        }),
        await this.prisma.countrySettings.findMany({
          where: { OR: [{ logoUrl: among }, { faviconUrl: among }, { loginBackgroundUrl: among }] },
          select: { logoUrl: true, faviconUrl: true, loginBackgroundUrl: true },
        }),
        await this.prisma.submission.findMany({ where: { attachmentKey: among }, select: { attachmentKey: true } }),
        await this.prisma.certificate.findMany({ where: { pdfKey: among }, select: { pdfKey: true } }),
      ];

      for (const row of rows.flat()) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') referenced.add(value);
        }
      }
    }

    return referenced;
  }
}
