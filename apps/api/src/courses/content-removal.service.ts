import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileOwnershipService } from '../storage/file-ownership.service';

/** Lo que se borra del contenido: un recurso, un módulo o un curso entero. */
export type ContentTarget = { resourceGuid: string } | { moduleGuid: string } | { courseGuid: string };

/** Los recursos que desaparecen con lo que se borra. */
function resourcesOf(target: ContentTarget): Prisma.ResourceWhereInput {
  if ('resourceGuid' in target) return { guid: target.resourceGuid };
  if ('moduleGuid' in target) return { moduleGuid: target.moduleGuid };
  return { module: { courseGuid: target.courseGuid } };
}

/**
 * Borra contenido de un curso con lo que cuelga de él: las entregas de sus tareas y, del disco,
 * el material, los archivos entregados y la portada si es el curso entero.
 */
@Injectable()
export class ContentRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileOwnershipService,
  ) {}

  async remove(target: ContentTarget): Promise<void> {
    const resources = resourcesOf(target);
    const keys = await this.fileKeys(target, resources);

    // Borrar una tarea sólo suelta sus entregas: quedarían sin curso y con su archivo en el disco.
    await this.prisma.$transaction([
      this.prisma.submission.deleteMany({ where: { assignment: resources } }),
      this.deleteRow(target),
    ]);
    await this.files.deleteUnreferenced(keys);
  }

  private async fileKeys(target: ContentTarget, resources: Prisma.ResourceWhereInput): Promise<(string | null)[]> {
    const [cover, material, submissions] = await Promise.all([
      this.coverOf(target),
      this.prisma.resource.findMany({
        where: { ...resources, OR: [{ attachmentKey: { not: null } }, { fileUrl: { not: null } }] },
        select: { attachmentKey: true, fileUrl: true },
      }),
      this.prisma.submission.findMany({
        where: { assignment: resources, attachmentKey: { not: null } },
        select: { attachmentKey: true },
      }),
    ]);

    return [
      cover,
      ...material.flatMap((resource) => [resource.attachmentKey, resource.fileUrl]),
      ...submissions.map((submission) => submission.attachmentKey),
    ];
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
