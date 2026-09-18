import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CursoAccesoService } from './curso-acceso.service';
import { validarConfiguracionQuiz } from './quiz-config';
import { recursoParaElCliente } from './recurso.vista';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateBloqueDto, UpdateBloqueDto } from './dto/bloques.dto';
import { CreateModuloDto, UpdateModuloDto } from './dto/cursos.dto';

/**
 * Contenido de un curso: módulos y los recursos que cuelgan de ellos.
 *
 * La jerarquía es `curso → módulo → recurso`. Antes había una capa intermedia,
 * `lms_lecciones`, de la que cada módulo creaba exactamente una instancia artificial
 * llamada «Lección Interna Módulo <guid>». No aportaba nada: sumaba un JOIN a cada lectura
 * y un `flatMap` anidado a cada recorrido, y hacía que el modelo del código no coincidiera
 * con el modelo mental de quien usa la aplicación. Se eliminó y los recursos cuelgan
 * directamente del módulo.
 *
 * Todas las operaciones exigen que el curso esté en BORRADOR: un curso publicado tiene
 * alumnos avanzando por él y cambiarle el contenido invalidaría su progreso.
 */
@Injectable()
export class BloqueService {
  private readonly logger = new Logger(BloqueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly storage: StorageService,
  ) {}

  // ── Módulos ──────────────────────────────────────────────────────────────

  async crearModulo(cursoGuid: string, dto: CreateModuloDto, user: JwtPayload) {
    await this.acceso.cursoEditable(cursoGuid, user);

    const orden = dto.orden ?? (await this.prisma.lms_modulos.count({ where: { curso_guid: cursoGuid } }));
    return this.prisma.lms_modulos.create({
      data: { curso_guid: cursoGuid, titulo: dto.titulo, orden },
    });
  }

  async actualizarModulo(moduloGuid: string, dto: UpdateModuloDto, user: JwtPayload) {
    const curso = await this.acceso.cursoDeModulo(moduloGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    return this.prisma.lms_modulos.update({
      where: { guid: moduloGuid },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.requiere_anterior !== undefined && { requiere_anterior: dto.requiere_anterior }),
      },
    });
  }

  /** Elimina un módulo y, con él, sus recursos y los archivos que tuvieran adjuntos. */
  async eliminarModulo(moduloGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeModulo(moduloGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    const adjuntos = await this.prisma.lms_recursos.findMany({
      where: { modulo_guid: moduloGuid, archivo_adjunto: { not: null } },
      select: { archivo_adjunto: true },
    });

    await this.prisma.lms_modulos.delete({ where: { guid: moduloGuid } });
    void this.borrarArchivos(adjuntos.map((r) => r.archivo_adjunto));

    return { message: 'Módulo eliminado.' };
  }

  /** Reordena los módulos de un curso según la lista recibida. */
  async reordenarModulos(cursoGuid: string, guids: string[], user: JwtPayload) {
    await this.acceso.cursoEditable(cursoGuid, user);
    await this.reordenar('lms_modulos', { curso_guid: cursoGuid }, guids);
    return { message: 'Orden actualizado.' };
  }

  // ── Recursos ─────────────────────────────────────────────────────────────

  async crearRecurso(moduloGuid: string, dto: CreateBloqueDto, user: JwtPayload) {
    const curso = await this.acceso.cursoDeModulo(moduloGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    const orden = await this.prisma.lms_recursos.count({ where: { modulo_guid: moduloGuid } });
    return this.prisma.lms_recursos.create({
      data: {
        modulo_guid: moduloGuid,
        titulo: dto.titulo || 'Nuevo bloque',
        tipo: dto.tipo,
        contenido_html: dto.contenido_html,
        orden,
      },
    });
  }

  /** Ficha de un recurso para el editor, con la configuración completa del cuestionario. */
  async getRecurso(recursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeRecurso(recursoGuid, user.pais);
    await this.acceso.cursoQueGestiona(curso.guid, user);

    const recurso = await this.prisma.lms_recursos.findUnique({ where: { guid: recursoGuid } });
    if (!recurso) throw new NotFoundException('Recurso no encontrado.');
    return recursoParaElCliente(recurso, this.storage);
  }

  /**
   * Actualiza un recurso.
   * La configuración del cuestionario se valida antes de guardarla: así el error aparece
   * en el editor, donde se puede corregir, y no delante del alumno al empezar el examen.
   */
  async actualizarRecurso(recursoGuid: string, dto: UpdateBloqueDto, user: JwtPayload) {
    const curso = await this.acceso.cursoDeRecurso(recursoGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    if (dto.quiz_config) validarConfiguracionQuiz(dto.quiz_config);

    const anterior = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { archivo_adjunto: true, url_archivo: true },
    });

    const actualizado = await this.prisma.lms_recursos.update({
      where: { guid: recursoGuid },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo }),
        ...(dto.contenido_html !== undefined && { contenido_html: dto.contenido_html }),
        ...(dto.url_archivo !== undefined && { url_archivo: dto.url_archivo }),
        ...(dto.url_referencia !== undefined && { url_referencia: dto.url_referencia }),
        ...(dto.archivo_adjunto !== undefined && { archivo_adjunto: dto.archivo_adjunto }),
        ...(dto.archivo_adjunto_nombre !== undefined && { archivo_adjunto_nombre: dto.archivo_adjunto_nombre }),
        ...(dto.quiz_config !== undefined && { quiz_config: dto.quiz_config }),
        ...(dto.archivo_max_size_mb !== undefined && { archivo_max_size_mb: dto.archivo_max_size_mb }),
        ...(dto.tiempo_lectura !== undefined && { tiempo_lectura: dto.tiempo_lectura }),
      },
    });

    // Los archivos que quedan sustituidos se borran después de guardar: si el borrado
    // falla, el recurso ya está bien y sólo sobra un archivo que recogerá el mantenimiento.
    void this.borrarArchivos([
      this.reemplazado(anterior?.archivo_adjunto, dto.archivo_adjunto),
      this.reemplazado(anterior?.url_archivo, dto.url_archivo),
    ]);

    return actualizado;
  }

  async eliminarRecurso(recursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeRecurso(recursoGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { archivo_adjunto: true, url_archivo: true },
    });

    await this.prisma.lms_recursos.delete({ where: { guid: recursoGuid } });
    void this.borrarArchivos([recurso?.archivo_adjunto, recurso?.url_archivo]);

    return { message: 'Bloque eliminado.' };
  }

  async reordenarRecursos(moduloGuid: string, guids: string[], user: JwtPayload) {
    const curso = await this.acceso.cursoDeModulo(moduloGuid, user.pais);
    await this.acceso.cursoEditable(curso.guid, user);

    await this.reordenar('lms_recursos', { modulo_guid: moduloGuid }, guids);
    return { message: 'Orden actualizado.' };
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  /**
   * Aplica un nuevo orden dentro de un contenedor.
   * Filtra los identificadores que no pertenezcan al contenedor: una lista manipulada no
   * puede reordenar elementos de otro curso.
   */
  private async reordenar(
    tabla: 'lms_modulos' | 'lms_recursos',
    filtro: Record<string, string>,
    guids: string[],
  ): Promise<void> {
    const delegado = this.prisma[tabla] as unknown as {
      findMany(args: unknown): Promise<{ guid: string }[]>;
      update(args: unknown): Prisma.PrismaPromise<unknown>;
    };

    const existentes = await delegado.findMany({ where: filtro, select: { guid: true } });
    const permitidos = new Set(existentes.map((e) => e.guid));
    const orden = guids.filter((guid) => permitidos.has(guid));
    if (orden.length === 0) return;

    await this.prisma.$transaction(
      orden.map((guid, indice) => delegado.update({ where: { guid }, data: { orden: indice } })),
    );
  }

  /** Devuelve la clave anterior sólo si el campo se está sustituyendo por otra distinta. */
  private reemplazado(anterior: string | null | undefined, nuevo: string | null | undefined): string | null {
    if (nuevo === undefined || !anterior || anterior === nuevo) return null;
    return anterior;
  }

  private async borrarArchivos(claves: (string | null | undefined)[]): Promise<void> {
    for (const clave of claves) {
      if (!clave) continue;
      await this.storage
        .deleteFile(clave)
        .catch((error) => this.logger.warn(`No se pudo borrar el archivo ${clave}`, error));
    }
  }
}
