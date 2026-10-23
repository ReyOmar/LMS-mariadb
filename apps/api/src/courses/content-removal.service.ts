import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { NOTIFICATION_REF } from '../notifications/notification-ref';

/** Lo que se borra del contenido: un recurso, un módulo o un curso entero. */
export type ContentTarget = { resourceGuid: string } | { moduleGuid: string } | { courseGuid: string };

/** Los recursos que desaparecen con lo que se borra. */
function resourcesOf(target: ContentTarget): Prisma.ResourceWhereInput {
  if ('resourceGuid' in target) return { guid: target.resourceGuid };
  if ('moduleGuid' in target) return { moduleGuid: target.moduleGuid };
  return { module: { courseGuid: target.courseGuid } };
}

/**
 * Borra contenido de un curso con lo que cuelga de él: las entregas de sus tareas, los avisos
 * que apuntan a lo borrado y, del disco, el material, los archivos entregados y la portada si es
 * el curso entero.
 */
@Injectable()
export class ContentRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileOwnershipService,
  ) {}

  async remove(target: ContentTarget): Promise<void> {
    const resources = resourcesOf(target);
    const [cover, material, submissions] = await Promise.all([
      this.coverOf(target),
      this.prisma.resource.findMany({ where: resources, select: { guid: true, attachmentKey: true, fileUrl: true } }),
      this.prisma.submission.findMany({
        where: { assignment: resources },
        select: { guid: true, attachmentKey: true },
      }),
    ]);

    // Borrar una tarea sólo suelta sus entregas: quedarían sin curso y con su archivo en el disco.
    // Los avisos de lo borrado llevarían a algo que ya no existe.
    await this.prisma.$transaction([
      this.prisma.notification.deleteMany({
        where: {
          OR: [
            ...('courseGuid' in target ? [{ refType: NOTIFICATION_REF.course, refGuid: target.courseGuid }] : []),
            { refType: NOTIFICATION_REF.quiz, refGuid: { in: material.map((resource) => resource.guid) } },
            { refType: NOTIFICATION_REF.submission, refGuid: { in: submissions.map((submission) => submission.guid) } },
          ],
        },
      }),
      this.prisma.submission.deleteMany({ where: { assignment: resources } }),
      this.deleteRow(target),
    ]);
    await this.files.deleteUnreferenced([
      cover,
      ...material.flatMap((resource) => [resource.attachmentKey, resource.fileUrl]),
      ...submissions.map((submission) => submission.attachmentKey),
    ]);
  }

  private async coverOf(target: ContentTarget): Promise<string | null> {
    if (!('courseGuid' in target)) return null;
    const course = await this.prisma.course.findUnique({
      where: { guid: target.courseGuid },
      select: { coverImage: true },
    });
    return course?.coverImage ?? null;
  }

  private deleteRow(target: ContentTarget) {
    if ('resourceGuid' in target) return this.prisma.resource.delete({ where: { guid: target.resourceGuid } });
    if ('moduleGuid' in target) return this.prisma.courseModule.delete({ where: { guid: target.moduleGuid } });
    return this.prisma.course.delete({ where: { guid: target.courseGuid } });
  }
}
