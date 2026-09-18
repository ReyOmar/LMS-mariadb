import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CursoAccesoService } from './curso-acceso.service';
import { parsearConfiguracionQuiz, sinRespuestas } from './quiz-config';
import { Pais } from '../common/domain/pais';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateCursoDto, UpdateCursoDto } from './dto/cursos.dto';

/** Campos que bastan para pintar una tarjeta de curso en cualquier listado. */
const RESUMEN_CURSO = {
  guid: true,
  titulo: true,
  descripcion_corta: true,
  imagen_portada: true,
  nivel: true,
  estado: true,
  duracion_horas: true,
  nota_aprobacion: true,
  emite_certificado: true,
  profesor_guid: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.lms_cursosSelect;

/**
 * Gestión de cursos: listados, ficha y ciclo de vida (borrador ↔ publicado).
 * El contenido (módulos y recursos) lo lleva `BloqueService` y la evaluación `QuizService`.
 */
@Injectable()
export class CursosService {
  private readonly logger = new Logger(CursosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: CursoAccesoService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Listados ─────────────────────────────────────────────────────────────

  /**
   * Cursos que ve el usuario según su rol. Siempre dentro de su sede.
   *  - Estudiante: aquellos en los que está matriculado.
   *  - Profesor: los que tiene asignados.
   *  - Administrador: todos los de la sede.
   */
  async getCursosDelUsuario(user: JwtPayload) {
    switch (user.role) {
      case 'ESTUDIANTE':
        return this.getCursosDeEstudiante(user.sub);
      case 'PROFESOR':
        return this.getCursosDeProfesor(user.sub, user.pais);
      case 'ADMINISTRADOR':
        return this.prisma.lms_cursos.findMany({
          where: { pais: user.pais },
          select: RESUMEN_CURSO,
          orderBy: { created_at: 'desc' },
        });
    }
  }

  private async getCursosDeEstudiante(usuarioGuid: string) {
    const matriculas = await this.prisma.lms_matriculas.findMany({
      where: { usuario_guid: usuarioGuid, activa: true },
      select: { fecha_matricula: true, curso: { select: RESUMEN_CURSO } },
      orderBy: { fecha_matricula: 'desc' },
    });
    return matriculas.map(({ curso, fecha_matricula }) => ({ ...curso, fecha_asignacion: fecha_matricula }));
  }

  private getCursosDeProfesor(profesorGuid: string, pais: Pais) {
    return this.prisma.lms_cursos.findMany({
      where: { profesor_guid: profesorGuid, pais },
      select: RESUMEN_CURSO,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Cursos de un usuario concreto, para la ficha que ve un administrador.
   * El usuario consultado debe ser de la misma sede.
   */
  async getCursosDeUsuario(usuarioGuid: string, pais: Pais) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { guid: usuarioGuid, pais },
      select: { rol: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    return usuario.rol === 'ESTUDIANTE'
      ? this.getCursosDeEstudiante(usuarioGuid)
      : this.getCursosDeProfesor(usuarioGuid, pais);
  }

  // ── Ficha del curso ──────────────────────────────────────────────────────

  /**
   * Ficha completa para quien gestiona el curso, con la configuración de los
   * cuestionarios incluidas las respuestas correctas.
   */
  async getCursoParaGestion(cursoGuid: string, user: JwtPayload) {
    await this.acceso.cursoQueGestiona(cursoGuid, user);
    return this.cargarCursoConContenido(cursoGuid);
  }

  /**
   * Ficha para un alumno matriculado.
   *
   * La diferencia clave con la versión de gestión es que aquí los cuestionarios salen
   * **sin las respuestas correctas**. Antes se devolvía el mismo objeto a todo el mundo y
   * las respuestas llegaban al navegador del alumno antes de que empezara el examen.
   */
  async getCursoParaEstudiante(cursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeSede(cursoGuid, user.pais);
    await this.acceso.asegurarMatricula(cursoGuid, user.sub);

    if (curso.estado !== 'PUBLICADO') {
      throw new BadRequestException(
        'Este curso está en mantenimiento en este momento. Te avisaremos en cuanto vuelva a estar disponible.',
      );
    }

    const completo = await this.cargarCursoConContenido(cursoGuid);
    return {
      ...completo,
      modulos: completo.modulos.map((modulo) => ({
        ...modulo,
        recursos: modulo.recursos.map((recurso) => ({
          ...recurso,
          quiz_config: this.quizConfigParaAlumno(recurso.quiz_config, recurso.guid),
        })),
      })),
    };
  }

  /**
   * Serializa el cuestionario sin respuestas. Si la configuración está dañada devuelve
   * `null` y lo registra, en vez de romper la carga entera del curso por un recurso.
   */
  private quizConfigParaAlumno(crudo: string | null, recursoGuid: string): string | null {
    if (!crudo) return null;
    try {
      return JSON.stringify(sinRespuestas(parsearConfiguracionQuiz(crudo)));
    } catch (error) {
      this.logger.error(`Cuestionario con configuración inválida en el recurso ${recursoGuid}`, error);
      return null;
    }
  }

  private async cargarCursoConContenido(cursoGuid: string) {
    const curso = await this.prisma.lms_cursos.findUnique({
      where: { guid: cursoGuid },
      include: {
        profesor: { select: { guid: true, nombre: true, apellido: true } },
        modulos: {
          orderBy: { orden: 'asc' },
          include: { recursos: { orderBy: { orden: 'asc' } } },
        },
      },
    });
    if (!curso) throw new NotFoundException('Curso no encontrado.');
    return curso;
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  /** Crea un curso en borrador, asignado a quien se indique o a quien lo crea. */
  async createCurso(dto: CreateCursoDto, user: JwtPayload) {
    const profesorGuid = dto.profesor_guid ?? user.sub;

    const profesor = await this.prisma.usuarios.findFirst({
      where: { guid: profesorGuid, pais: user.pais, activo: true, rol: { in: ['ADMINISTRADOR', 'PROFESOR'] } },
      select: { guid: true },
    });
    if (!profesor) {
      throw new BadRequestException('El responsable del curso debe ser un profesor o administrador activo de tu sede.');
    }

    const curso = await this.prisma.lms_cursos.create({
      data: { titulo: dto.titulo, pais: user.pais, estado: 'BORRADOR', profesor_guid: profesorGuid },
      select: RESUMEN_CURSO,
    });

    this.realtime.emitirASede('course:created', { guid: curso.guid, titulo: curso.titulo }, user.pais);
    return curso;
  }

  /**
   * Actualiza la ficha del curso.
   *
   * Antes el DTO aceptaba una docena de campos pero sólo se aplicaban tres: cambiar la
   * descripción, el nivel o la nota de aprobación se guardaba «con éxito» y no pasaba
   * nada. Ahora se escribe todo lo que el DTO admite.
   */
  async updateCurso(cursoGuid: string, dto: UpdateCursoDto, user: JwtPayload) {
    const curso = await this.acceso.cursoQueGestiona(cursoGuid, user);

    if (dto.estado && dto.estado !== curso.estado) {
      await this.validarCambioDeEstado(curso, dto.estado);
    }

    const actualizado = await this.prisma.lms_cursos.update({
      where: { guid: cursoGuid },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.descripcion_corta !== undefined && { descripcion_corta: dto.descripcion_corta }),
        ...(dto.imagen_portada !== undefined && { imagen_portada: dto.imagen_portada }),
        ...(dto.nivel !== undefined && { nivel: dto.nivel }),
        ...(dto.estado !== undefined && { estado: dto.estado }),
        ...(dto.duracion_horas !== undefined && { duracion_horas: dto.duracion_horas }),
        ...(dto.nota_aprobacion !== undefined && { nota_aprobacion: dto.nota_aprobacion }),
        ...(dto.orden_estricto !== undefined && { orden_estricto: dto.orden_estricto }),
        ...(dto.emite_certificado !== undefined && { emite_certificado: dto.emite_certificado }),
        ...(dto.max_estudiantes !== undefined && { max_estudiantes: dto.max_estudiantes }),
        ...(dto.codigo_acceso !== undefined && { codigo_acceso: dto.codigo_acceso || null }),
        ...(dto.fecha_inicio !== undefined && { fecha_inicio: dto.fecha_inicio ? new Date(dto.fecha_inicio) : null }),
        ...(dto.fecha_fin !== undefined && { fecha_fin: dto.fecha_fin ? new Date(dto.fecha_fin) : null }),
      },
      select: RESUMEN_CURSO,
    });

    if (dto.estado && dto.estado !== curso.estado) {
      await this.anunciarCambioDeEstado(actualizado.guid, actualizado.titulo, dto.estado, user.pais);
    }

    this.realtime.emitirASede('course:updated', { guid: cursoGuid, estado: actualizado.estado }, user.pais);
    return actualizado;
  }

  /**
   * Un curso publicado no vuelve a borrador mientras haya alguien haciendo un examen:
   * el intento quedaría huérfano y el alumno perdería su tiempo y su intento.
   */
  private async validarCambioDeEstado(curso: { guid: string; estado: string }, nuevoEstado: string): Promise<void> {
    if (curso.estado !== 'PUBLICADO' || nuevoEstado === 'PUBLICADO') return;

    const examenesEnCurso = await this.prisma.lms_entregas.count({
      where: { estado: 'BORRADOR', tarea: { modulo: { curso_guid: curso.guid } } },
    });

    if (examenesEnCurso > 0) {
      throw new BadRequestException(
        `No se puede pasar a Borrador: ${examenesEnCurso} estudiante(s) están realizando un cuestionario ahora mismo. Espera a que terminen.`,
      );
    }
  }

  /**
   * Avisa a los matriculados cuando el curso entra en mantenimiento o vuelve a publicarse.
   *
   * Sustituye al proceso que cada cinco minutos comparaba la lista de borradores con una
   * copia en memoria para adivinar qué había cambiado: aquí el cambio se conoce con
   * certeza en el momento en que ocurre.
   */
  private async anunciarCambioDeEstado(
    cursoGuid: string,
    titulo: string,
    estado: string,
    pais: Pais,
  ): Promise<void> {
    if (estado !== 'BORRADOR' && estado !== 'PUBLICADO') return;

    const matriculados = await this.prisma.lms_matriculas.findMany({
      where: { curso_guid: cursoGuid, activa: true },
      select: { usuario: { select: { guid: true, email: true, nombre: true } } },
    });
    if (matriculados.length === 0) return;

    const guids = matriculados.map((m) => m.usuario.guid);
    const enMantenimiento = estado === 'BORRADOR';

    this.realtime.emitirAUsuarios(
      enMantenimiento ? 'course:maintenance' : 'course:updated',
      { curso_guid: cursoGuid, guid: cursoGuid, titulo, estado },
      pais,
      guids,
    );

    // Los correos no bloquean la respuesta: publicar un curso no puede depender del
    // servidor de correo.
    void Promise.all(
      matriculados.map(({ usuario }) =>
        enMantenimiento
          ? this.mail.sendCourseMaintenanceNotification(usuario.email, usuario.nombre, titulo, pais)
          : this.mail.sendCourseReactivated(usuario.email, usuario.nombre, titulo, pais),
      ),
    ).catch((error) => this.logger.error(`Fallo al avisar del cambio de estado de ${cursoGuid}`, error));
  }

  /** Reasigna el responsable del curso. */
  async asignarProfesor(cursoGuid: string, profesorGuid: string, user: JwtPayload) {
    await this.acceso.cursoDeSede(cursoGuid, user.pais);

    const profesor = await this.prisma.usuarios.findFirst({
      where: { guid: profesorGuid, pais: user.pais, activo: true, rol: { in: ['ADMINISTRADOR', 'PROFESOR'] } },
      select: { guid: true },
    });
    if (!profesor) {
      throw new BadRequestException('El responsable debe ser un profesor o administrador activo de tu sede.');
    }

    const actualizado = await this.prisma.lms_cursos.update({
      where: { guid: cursoGuid },
      data: { profesor_guid: profesorGuid },
      select: RESUMEN_CURSO,
    });

    this.realtime.emitirASede('course:updated', { guid: cursoGuid }, user.pais);
    return actualizado;
  }

  /**
   * Elimina un curso en borrador y los archivos asociados.
   * Los certificados ya emitidos son documentos con valor probatorio, así que un curso con
   * certificados no se borra: hay que archivarlo.
   */
  async deleteCurso(cursoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoQueGestiona(cursoGuid, user);
    if (curso.estado !== 'BORRADOR') {
      throw new BadRequestException('Sólo se pueden eliminar cursos en estado Borrador.');
    }

    const certificados = await this.prisma.lms_certificados.count({ where: { curso_guid: cursoGuid } });
    if (certificados > 0) {
      throw new BadRequestException(
        `Este curso tiene ${certificados} certificado(s) emitido(s) y no puede eliminarse. Archívalo para retirarlo de la vista sin perder los certificados.`,
      );
    }

    const archivos = await this.archivosDelCurso(cursoGuid);
    await this.prisma.lms_cursos.delete({ where: { guid: cursoGuid } });

    void this.limpiarArchivos(archivos);
    this.realtime.emitirASede('course:deleted', { guid: cursoGuid }, user.pais);

    return { message: 'Curso eliminado.' };
  }

  /** Reúne las claves de almacenamiento que dejarán de usarse al borrar el curso. */
  private async archivosDelCurso(cursoGuid: string): Promise<string[]> {
    const [curso, recursos, entregas] = await Promise.all([
      this.prisma.lms_cursos.findUnique({ where: { guid: cursoGuid }, select: { imagen_portada: true } }),
      this.prisma.lms_recursos.findMany({
        where: { modulo: { curso_guid: cursoGuid }, archivo_adjunto: { not: null } },
        select: { archivo_adjunto: true },
      }),
      this.prisma.lms_entregas.findMany({
        where: { tarea: { modulo: { curso_guid: cursoGuid } }, url_archivo_adjunto: { not: null } },
        select: { url_archivo_adjunto: true },
      }),
    ]);

    return [
      curso?.imagen_portada,
      ...recursos.map((r) => r.archivo_adjunto),
      ...entregas.map((e) => e.url_archivo_adjunto),
    ].filter((clave): clave is string => Boolean(clave));
  }

  private async limpiarArchivos(claves: string[]): Promise<void> {
    for (const clave of claves) {
      await this.storage
        .deleteFile(clave)
        .catch((error) => this.logger.warn(`No se pudo borrar el archivo ${clave}`, error));
    }
  }
}
