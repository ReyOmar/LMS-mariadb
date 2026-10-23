import { BadRequestException, Injectable } from '@nestjs/common';
import { isURL } from 'class-validator';
import { Prisma, Resource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { CourseAccessService } from './course-access.service';
import { ContentRemovalService } from './content-removal.service';
import { serializeQuizConfig, validateQuizConfig } from './quiz-config';
import { toClientResource } from './resource-view';
import { nextPosition } from './syllabus-order';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateResourceDto, UpdateResourceDto } from './dto/resources.dto';
import { CreateModuleDto, UpdateModuleDto } from './dto/courses.dto';

/** Lo que se admite como dirección de un recurso de tipo enlace. */
const LINK_ADDRESS = { require_protocol: true, require_tld: false, protocols: ['http', 'https'] };

/**
 * Un enlace guarda su dirección en el contenido. Sin protocolo, el alumno vería un vínculo
 * a cualquier cosa en lugar del vídeo o la página que se quería enlazar.
 */
function assertLinkAddress(type: string | undefined, address: string | undefined): void {
  if (type === 'LINK' && address && !isURL(address, LINK_ADDRESS)) {
    throw new BadRequestException('La dirección del enlace debe ser una URL completa (https://…).');
  }
}

type ResourceFields = Partial<
  Pick<
    Resource,
    'title' | 'contentHtml' | 'referenceUrl' | 'attachmentKey' | 'attachmentName' | 'quizConfig' | 'maxUploadMb'
  >
>;

/**
 * Lo que el DTO fija de un recurso. Una cadena vacía en el cuestionario se guarda como nulo: el
 * resto del sistema distingue cuestionario de tarea por `quizConfig IS NULL`, y '' convertiría
 * la tarea en un cuestionario roto. Se valida antes de guardarlo: así el error aparece en el
 * editor, donde se puede corregir, y no delante del alumno al empezar el examen.
 */
function resourceFields(dto: CreateResourceDto | UpdateResourceDto): ResourceFields {
  const quizConfig = dto.quizConfig ? serializeQuizConfig(validateQuizConfig(dto.quizConfig)) : null;
  return {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.contentHtml !== undefined && { contentHtml: dto.contentHtml }),
    ...(dto.referenceUrl !== undefined && { referenceUrl: dto.referenceUrl }),
    ...(dto.attachmentKey !== undefined && { attachmentKey: dto.attachmentKey }),
    ...(dto.attachmentName !== undefined && { attachmentName: dto.attachmentName }),
    ...(dto.quizConfig !== undefined && { quizConfig }),
    ...(dto.maxUploadMb !== undefined && { maxUploadMb: dto.maxUploadMb }),
  };
}

/**
 * Contenido de un curso: módulos y los recursos que cuelgan de ellos.
 *
 * Toda modificación exige que el curso esté en BORRADOR: un curso publicado tiene alumnos
 * avanzando por él y cambiarle el contenido invalidaría su progreso.
 */
@Injectable()
export class CourseContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly files: FileOwnershipService,
    private readonly removal: ContentRemovalService,
  ) {}

  // ── Módulos ──────────────────────────────────────────────────────────────

  async createModule(courseGuid: string, dto: CreateModuleDto, user: JwtPayload) {
    await this.access.editableCourse(courseGuid, user);

    const position = nextPosition(
      await this.prisma.courseModule.aggregate({ where: { courseGuid }, _max: { position: true } }),
    );
    return this.prisma.courseModule.create({
      data: { courseGuid, title: dto.title, position },
    });
  }

  async updateModule(moduleGuid: string, dto: UpdateModuleDto, user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);

    return this.prisma.courseModule.update({
      where: { guid: moduleGuid },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  /** Elimina un módulo y, con él, sus recursos, las entregas de sus tareas y sus archivos. */
  async deleteModule(moduleGuid: string, user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);
    await this.removal.remove({ moduleGuid });
    return { message: 'Módulo eliminado.' };
  }

  // ── Recursos ─────────────────────────────────────────────────────────────

  /** Crea el recurso completo de una vez: si algo no vale, no queda nada a medias. */
  async createResource(moduleGuid: string, dto: CreateResourceDto, user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);
    assertLinkAddress(dto.type, dto.contentHtml);
    const fields = resourceFields(dto);

    const position = nextPosition(
      await this.prisma.resource.aggregate({ where: { moduleGuid }, _max: { position: true } }),
    );
    const attachment = { folder: 'recursos' as const, current: null, next: dto.attachmentKey };
    const created = await this.files.replace([attachment], { uploader: user.sub }, () =>
      this.prisma.resource.create({
        data: { ...fields, moduleGuid, type: dto.type, position, title: dto.title || 'Nuevo bloque' },
      }),
    );
    return toClientResource(created, this.storage);
  }

  async updateResource(resourceGuid: string, dto: UpdateResourceDto, user: JwtPayload) {
    await this.access.editableCourseOfResource(resourceGuid, user);
    const fields = resourceFields(dto);

    const previous = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { type: true, attachmentKey: true },
    });
    assertLinkAddress(previous?.type, dto.contentHtml);
    const attachment = { folder: 'recursos' as const, current: previous?.attachmentKey, next: dto.attachmentKey };

    const updated = await this.files.replace([attachment], { uploader: user.sub }, () =>
      this.prisma.resource.update({ where: { guid: resourceGuid }, data: fields }),
    );
    return toClientResource(updated, this.storage);
  }

  /** Elimina un recurso y, si es una tarea, sus entregas; con ellos, sus archivos. */
  async deleteResource(resourceGuid: string, user: JwtPayload) {
    await this.access.editableCourseOfResource(resourceGuid, user);
    await this.removal.remove({ resourceGuid });
    return { message: 'Bloque eliminado.' };
  }

  async reorderModules(courseGuid: string, guids: string[], user: JwtPayload) {
    await this.access.editableCourse(courseGuid, user);

    const existing = await this.prisma.courseModule.findMany({ where: { courseGuid }, select: { guid: true } });
    await this.saveOrder(guids, existing, (guid, position) =>
      this.prisma.courseModule.update({ where: { guid }, data: { position } }),
    );
    return { message: 'Orden actualizado.' };
  }

  async reorderResources(moduleGuid: string, guids: string[], user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);

    const existing = await this.prisma.resource.findMany({ where: { moduleGuid }, select: { guid: true } });
    await this.saveOrder(guids, existing, (guid, position) =>
      this.prisma.resource.update({ where: { guid }, data: { position } }),
    );
    return { message: 'Orden actualizado.' };
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Aplica un nuevo orden dentro de un contenedor.
   * Descarta los identificadores que no pertenezcan a él: una lista manipulada no puede
   * reordenar elementos de otro curso.
   */
  private async saveOrder(
    requested: string[],
    existing: { guid: string }[],
    update: (guid: string, position: number) => Prisma.PrismaPromise<unknown>,
  ): Promise<void> {
    const allowed = new Set(existing.map((item) => item.guid));
    const ordered = [...new Set(requested)].filter((guid) => allowed.has(guid));
    if (ordered.length === 0) return;

    await this.prisma.$transaction(ordered.map((guid, position) => update(guid, position)));
  }
}
