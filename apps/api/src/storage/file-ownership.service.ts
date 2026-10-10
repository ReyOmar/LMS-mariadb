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

/** Claves por consulta al buscar quién las usa: una lista `IN` acotada. */
const REFERENCE_BATCH = 500;

/**
 * Reglas para usar y retirar archivos subidos.
 *
 * Una fila (curso, recurso, firma, configuración) sólo puede pasar a apuntar a un archivo
 * que haya subido quien la guarda, según el registro de subidas: si no, bastaría con
 * escribir la clave de un archivo ajeno —de otro profesor o de la otra sede— para
 * descargarlo y, al sustituirlo, borrarlo. Y un archivo sólo se borra cuando ya no lo usa
 * ninguna fila.
 */
@Injectable()
export class FileOwnershipService {
  private readonly logger = new Logger(FileOwnershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Comprueba que una fila puede pasar a guardar la clave `next` en un campo de la carpeta
   * indicada.
   *
   * Si la clave no cambia no se revisa: los archivos subidos antes de existir el registro no
   * tienen anotación y deben seguir funcionando donde ya estaban.
   *
   * @param current Lo que guarda ahora esa fila en ese campo.
   * @throws BadRequestException si la clave no consta como subida o es de otra carpeta.
   * @throws ForbiddenException si la subió otra persona o es de otra sede.
   */
  async assertCanUse(
    next: string | null | undefined,
    current: string | null | undefined,
    folder: Folder,
    owner: KeyOwner,
  ): Promise<void> {
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
   * Borra los archivos indicados que ya no use ninguna fila.
   *
   * Se llama después de guardar la sustitución o el borrado: una misma clave puede estar en
   * otra fila —la misma portada en dos cursos, o datos anteriores al registro— y ese archivo
   * se conserva. Nunca falla: si no se puede comprobar, no se borra nada y queda anotado en el
   * registro del servidor.
   */
  async deleteUnreferenced(keys: (string | null | undefined)[]): Promise<void> {
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

  /** De las claves dadas, las que guarda alguna fila. */
  private async referencedKeys(keys: string[]): Promise<Set<string>> {
    const referenced = new Set<string>();

    for (let start = 0; start < keys.length; start += REFERENCE_BATCH) {
      const among = { in: keys.slice(start, start + REFERENCE_BATCH) };

      // Una consulta tras otra y no a la vez: es una limpieza, y siete a la vez ocuparían
      // casi todo el pool mientras otras peticiones esperan conexión.
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
        await this.prisma.archivedSubmission.findMany({
          where: { attachmentKey: among },
          select: { attachmentKey: true },
        }),
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
