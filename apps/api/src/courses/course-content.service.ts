import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isURL } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { CourseAccessService } from './course-access.service';
import { ContentRemovalService } from './content-removal.service';
import { serializeQuizConfig, validateQuizConfig } from './quiz-config';
import { toClientResource } from './resource-view';
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

/** Lo que el DTO cambia de un recurso, con la configuración del cuestionario ya validada. */
function resourceChanges(dto: UpdateResourceDto, quizConfig: string | null): Prisma.ResourceUpdateInput {
  return {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.contentHtml !== undefined && { contentHtml: dto.contentHtml }),
    ...(dto.referenceUrl !== undefined && { referenceUrl: dto.referenceUrl }),
    ...(dto.attachmentKey !== undefined && { attachmentKey: dto.attachmentKey }),
    ...(dto.attachmentName !== undefined && { attachmentName: dto.attachmentName }),
    ...(dto.quizConfig !== undefined && { quizConfig }),
    ...(dto.maxUploadMb !== undefined && { maxUploadMb: dto.maxUploadMb }),
    ...(dto.readingMinutes !== undefined && { readingMinutes: dto.readingMinutes }),
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

    const position = dto.position ?? (await this.prisma.courseModule.count({ where: { courseGuid } }));
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
        ...(dto.requiresPrevious !== undefined && { requiresPrevious: dto.requiresPrevious }),
      },
    });
  }

  /** Elimina un módulo y, con él, sus recursos, las entregas de sus tareas y sus archivos. */
  async deleteModule(moduleGuid: string, user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);
    await this.removal.remove({ moduleGuid });
    return { message: 'Módulo eliminado.' };
  }

  /** Reordena los módulos de un curso según la lista recibida. */
  async reorderModules(courseGuid: string, guids: string[], user: JwtPayload) {
    await this.access.editableCourse(courseGuid, user);

    const existing = await this.prisma.courseModule.findMany({ where: { courseGuid }, select: { guid: true } });
    await this.saveOrder(guids, existing, (guid, position) =>
      this.prisma.courseModule.update({ where: { guid }, data: { position } }),
    );
    return { message: 'Orden actualizado.' };
  }

  // ── Recursos ─────────────────────────────────────────────────────────────

  async createResource(moduleGuid: string, dto: CreateResourceDto, user: JwtPayload) {
    await this.access.editableCourseOfModule(moduleGuid, user);
    assertLinkAddress(dto.type, dto.contentHtml);

    const position = await this.prisma.resource.count({ where: { moduleGuid } });
    return this.prisma.resource.create({
      data: { moduleGuid, title: dto.title || 'Nuevo bloque', type: dto.type, contentHtml: dto.contentHtml, position },
    });
  }

  /** Ficha de un recurso para el editor, con la configuración completa del cuestionario. */
  async getResource(resourceGuid: string, user: JwtPayload) {
    await this.access.managedCourseOfResource(resourceGuid, user);

    const resource = await this.prisma.resource.findUnique({ where: { guid: resourceGuid } });
    if (!resource) throw new NotFoundException('Recurso no encontrado.');
    return toClientResource(resource, this.storage);
  }

  /**
   * Actualiza un recurso.
   * La configuración del cuestionario se valida antes de guardarla: así el error aparece
   * en el editor, donde se puede corregir, y no delante del alumno al empezar el examen.
   */
  async updateResource(resourceGuid: string, dto: UpdateResourceDto, user: JwtPayload) {
    await this.access.editableCourseOfResource(resourceGuid, user);

    // Una cadena vacía se guarda como nulo: el resto del sistema distingue cuestionario de
    // tarea por `quizConfig IS NULL`, y '' convertiría la tarea en un cuestionario roto.
    const quizConfig = dto.quizConfig ? serializeQuizConfig(validateQuizConfig(dto.quizConfig)) : null;

    const previous = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { type: true, attachmentKey: true },
    });
    assertLinkAddress(previous?.type, dto.contentHtml);
    const attachment = { folder: 'recursos' as const, current: previous?.attachmentKey, next: dto.attachmentKey };

    const updated = await this.files.replace([attachment], { uploader: user.sub }, () =>
      this.prisma.resource.update({ where: { guid: resourceGuid }, data: resourceChanges(dto, quizConfig) }),
    );
    return toClientResource(updated, this.storage);
  }

  /** Elimina un recurso y, si es una tarea, sus entregas; con ellos, sus archivos. */
  async deleteResource(resourceGuid: string, user: JwtPayload) {
    await this.access.editableCourseOfResource(resourceGuid, user);
    await this.removal.remove({ resourceGuid });
    return { message: 'Bloque eliminado.' };
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
