import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { CursoAccesoService } from '../cursos/curso-acceso.service';
import { aNota, esAprobada, formatearNota, normalizarNota, umbralAprobacion } from '../common/domain/calificacion';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ArchivoSubido } from '../storage/multipart';
import { CalificarEntregaDto } from './dto/calificar-entrega.dto';

/** Entregas que se traen de una vez al panel del examinador. */
const LIMITE_PANEL_EXAMINADOR = 300;

/**
 * Entregas de tareas: subida por el alumno y calificación por el examinador.
 * Los cuestionarios autocorregidos van por `QuizService`; aquí sólo hay tareas que una
 * persona revisa.
 */
@Injectable()
export class EvaluacionesService {
  private readonly logger = new Logger(EvaluacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly acceso: CursoAccesoService,
    private readonly configuracion: ConfiguracionService,
    private readonly realtime: RealtimeService,
    private readonly eventos: EventEmitter2,
  ) {}

  // ── Alumno ───────────────────────────────────────────────────────────────

  /**
   * Registra la entrega de una tarea.
   *
   * Reenviar está permitido mientras no esté aprobada: si la nota anterior no alcanzó el
   * umbral, el alumno puede subir una versión corregida y la entrega vuelve a la cola del
   * examinador. Una entrega ya aprobada no se reemplaza, para que nadie pueda sustituir el
   * documento que respalda una nota ya dada.
   */
  async registrarEntrega(tareaGuid: string, archivo: ArchivoSubido, user: JwtPayload) {
    const curso = await this.acceso.asegurarAccesoARecurso(tareaGuid, user);
    const umbral = umbralAprobacion(curso.nota_aprobacion);

    const tarea = await this.prisma.lms_recursos.findUnique({
      where: { guid: tareaGuid },
      select: { titulo: true, tipo: true, quiz_config: true, archivo_max_size_mb: true },
    });
    if (!tarea || tarea.tipo !== 'TAREA') {
      throw new BadRequestException('Este recurso no admite entregas.');
    }
    if (tarea.quiz_config) {
      throw new BadRequestException('Este recurso es un cuestionario: se resuelve en línea, no se sube archivo.');
    }

    const previa = await this.prisma.lms_entregas.findFirst({
      where: { tarea_guid: tareaGuid, usuario_guid: user.sub },
      select: { guid: true, estado: true, calificacion: true, url_archivo_adjunto: true },
    });

    if (previa?.estado === 'CALIFICADA' && esAprobada(previa.calificacion, umbral)) {
      throw new BadRequestException(
        `Tu entrega ya fue aprobada con ${formatearNota(previa.calificacion)}. No necesitas volver a enviarla.`,
      );
    }

    const maxMb = tarea.archivo_max_size_mb ?? (await this.configuracion.getMaxArchivoMb(user.pais));
    const clave = await this.storage.uploadFromBuffer(
      archivo.contenido,
      archivo.nombre,
      'entregas',
      maxMb * 1024 * 1024,
    );

    const esReenvio = previa?.estado === 'CALIFICADA';
    const entrega = previa
      ? await this.prisma.lms_entregas.update({
          where: { guid: previa.guid },
          data: {
            url_archivo_adjunto: clave,
            respuesta_texto: archivo.nombre,
            estado: esReenvio ? 'EN_REVISION' : 'ENTREGADA',
            fecha_entrega: new Date(),
            archivo_purgado: false,
          },
        })
      : await this.prisma.lms_entregas.create({
          data: {
            tarea_guid: tareaGuid,
            usuario_guid: user.sub,
            url_archivo_adjunto: clave,
            respuesta_texto: archivo.nombre,
            estado: 'ENTREGADA',
            fecha_entrega: new Date(),
          },
        });

    // El archivo anterior se retira una vez guardada la referencia al nuevo.
    if (previa?.url_archivo_adjunto && previa.url_archivo_adjunto !== clave) {
      void this.storage
        .deleteFile(previa.url_archivo_adjunto)
        .catch((error) => this.logger.warn('No se pudo borrar la entrega anterior', error));
    }

    this.eventos.emit('entrega.recibida', {
      entrega_guid: entrega.guid,
      usuario_guid: user.sub,
      pais: user.pais,
      tarea_titulo: tarea.titulo,
      curso_titulo: curso.titulo,
      profesor_guid: curso.profesor_guid,
      es_reenvio: esReenvio,
      nota_anterior: aNota(previa?.calificacion),
    });

    return this.paraElAlumno(entrega);
  }

  /** Entrega del alumno en sesión para una tarea concreta. */
  async getMiEntrega(tareaGuid: string, user: JwtPayload) {
    await this.acceso.asegurarAccesoARecurso(tareaGuid, user);

    const entrega = await this.prisma.lms_entregas.findFirst({
      where: { tarea_guid: tareaGuid, usuario_guid: user.sub },
    });
    return entrega ? this.paraElAlumno(entrega) : { estado: 'PENDIENTE' as const };
  }

  /**
   * Proyección de una entrega hacia su autor.
   * El archivo se entrega como URL firmada y caducable, nunca como clave suelta: la clave
   * sola permitiría a cualquiera descargar el documento.
   */
  private paraElAlumno(entrega: {
    guid: string;
    estado: string;
    fecha_entrega: Date | null;
    respuesta_texto: string | null;
    url_archivo_adjunto: string | null;
    calificacion: unknown;
    comentario_calificacion: string | null;
    archivo_purgado: boolean;
    intento_numero: number;
  }) {
    return {
      guid: entrega.guid,
      estado: entrega.estado,
      fecha_entrega: entrega.fecha_entrega,
      archivo_nombre: entrega.respuesta_texto,
      archivo_url: entrega.url_archivo_adjunto ? this.storage.urlDeDescarga(entrega.url_archivo_adjunto) : null,
      archivo_purgado: entrega.archivo_purgado,
      calificacion: aNota(entrega.calificacion),
      comentario: entrega.comentario_calificacion,
      intento_numero: entrega.intento_numero,
    };
  }

  // ── Examinador ───────────────────────────────────────────────────────────

  /**
   * Entregas de los cursos que gestiona el usuario.
   * Un administrador ve las de toda su sede; un profesor, sólo las de sus cursos.
   */
  async getEntregasParaCalificar(user: JwtPayload) {
    const entregas = await this.prisma.lms_entregas.findMany({
      where: {
        tarea: {
          quiz_config: null,
          modulo: {
            curso: {
              pais: user.pais,
              ...(user.role === 'PROFESOR' ? { profesor_guid: user.sub } : {}),
            },
          },
        },
      },
      orderBy: [{ estado: 'asc' }, { fecha_entrega: 'desc' }],
      take: LIMITE_PANEL_EXAMINADOR,
      select: {
        guid: true,
        estado: true,
        fecha_entrega: true,
        respuesta_texto: true,
        url_archivo_adjunto: true,
        archivo_purgado: true,
        calificacion: true,
        comentario_calificacion: true,
        intento_numero: true,
        usuario: { select: { guid: true, nombre: true, apellido: true, email: true } },
        tarea: {
          select: {
            guid: true,
            titulo: true,
            modulo: {
              select: {
                guid: true,
                titulo: true,
                curso: { select: { guid: true, titulo: true, nota_aprobacion: true } },
              },
            },
          },
        },
      },
    });

    return entregas.map((entrega) => ({
      guid: entrega.guid,
      estado: entrega.estado,
      fecha_entrega: entrega.fecha_entrega,
      intento_numero: entrega.intento_numero,
      calificacion: aNota(entrega.calificacion),
      comentario: entrega.comentario_calificacion,
      nota_aprobacion: umbralAprobacion(entrega.tarea?.modulo.curso.nota_aprobacion),
      archivo_nombre: entrega.respuesta_texto,
      archivo_url: entrega.url_archivo_adjunto ? this.storage.urlDeDescarga(entrega.url_archivo_adjunto) : null,
      archivo_purgado: entrega.archivo_purgado,
      estudiante: entrega.usuario,
      tarea_guid: entrega.tarea?.guid ?? null,
      tarea_titulo: entrega.tarea?.titulo ?? 'Tarea eliminada',
      modulo_guid: entrega.tarea?.modulo.guid ?? null,
      modulo_titulo: entrega.tarea?.modulo.titulo ?? null,
      curso_guid: entrega.tarea?.modulo.curso.guid ?? null,
      curso_titulo: entrega.tarea?.modulo.curso.titulo ?? null,
    }));
  }

  /** Entregas de una tarea concreta, para el examinador que la gestiona. */
  async getEntregasDeTarea(tareaGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeRecurso(tareaGuid, user.pais);
    await this.acceso.cursoQueGestiona(curso.guid, user);

    const entregas = await this.prisma.lms_entregas.findMany({
      where: { tarea_guid: tareaGuid },
      orderBy: { fecha_entrega: 'desc' },
      select: {
        guid: true,
        estado: true,
        fecha_entrega: true,
        respuesta_texto: true,
        url_archivo_adjunto: true,
        archivo_purgado: true,
        calificacion: true,
        comentario_calificacion: true,
        intento_numero: true,
        usuario: { select: { guid: true, nombre: true, apellido: true, email: true } },
      },
    });

    return entregas.map((entrega) => ({
      ...entrega,
      calificacion: aNota(entrega.calificacion),
      archivo_url: entrega.url_archivo_adjunto ? this.storage.urlDeDescarga(entrega.url_archivo_adjunto) : null,
      url_archivo_adjunto: undefined,
    }));
  }

  /**
   * Califica una entrega.
   *
   * La comprobación de propiedad la hace `CursoAccesoService`: antes bastaba con tener rol
   * de profesor y conocer el identificador de la entrega para poner nota a los alumnos de
   * otro examinador.
   *
   * Aprobar marca el recurso como superado y dispara la comprobación de fin de curso;
   * suspender deja la tarea pendiente para que el alumno pueda reenviarla.
   */
  async calificarEntrega(entregaGuid: string, dto: CalificarEntregaDto, user: JwtPayload) {
    const { entrega, curso } = await this.acceso.cursoDeEntregaQueGestiona(entregaGuid, user);

    if (entrega.estado === 'BORRADOR') {
      throw new BadRequestException('Este intento todavía está en curso y no puede calificarse.');
    }

    const umbral = umbralAprobacion(curso.nota_aprobacion);
    const nota = normalizarNota(dto.calificacion);
    const aprobada = nota >= umbral;

    await this.prisma.lms_entregas.update({
      where: { guid: entregaGuid },
      data: {
        estado: 'CALIFICADA',
        calificacion: nota,
        comentario_calificacion: dto.comentario?.trim() || null,
      },
    });

    if (aprobada && entrega.tarea_guid) {
      await this.prisma.lms_progreso_recurso.upsert({
        where: {
          usuario_guid_recurso_guid: { usuario_guid: entrega.usuario_guid, recurso_guid: entrega.tarea_guid },
        },
        create: { usuario_guid: entrega.usuario_guid, recurso_guid: entrega.tarea_guid, completado: true },
        update: {},
      });
    }

    this.realtime.emitirAUsuarios(
      'submission:graded',
      { entrega_guid: entregaGuid, tarea_guid: entrega.tarea_guid, calificacion: nota, aprobada },
      user.pais,
      [entrega.usuario_guid],
    );

    this.eventos.emit('entrega.calificada', {
      entrega_guid: entregaGuid,
      usuario_guid: entrega.usuario_guid,
      pais: user.pais,
      curso_guid: curso.guid,
      tarea_guid: entrega.tarea_guid,
      tarea_titulo: entrega.tarea?.titulo ?? 'Tarea',
      nota,
      nota_aprobacion: umbral,
      aprobada,
      comentario: dto.comentario?.trim() || null,
    });

    return { guid: entregaGuid, calificacion: nota, aprobada, nota_aprobacion: umbral };
  }

  /**
   * Habilita un nuevo intento de cuestionario a un alumno que agotó los suyos.
   * Es la vía de escape que necesita el examinador cuando un alumno pierde un intento por
   * un problema de conexión o de dispositivo; queda registrado quién lo concedió.
   */
  async habilitarNuevoIntento(recursoGuid: string, alumnoGuid: string, user: JwtPayload) {
    const curso = await this.acceso.cursoDeRecurso(recursoGuid, user.pais);
    await this.acceso.cursoQueGestiona(curso.guid, user);

    const recurso = await this.prisma.lms_recursos.findUnique({
      where: { guid: recursoGuid },
      select: { titulo: true, quiz_config: true },
    });
    if (!recurso?.quiz_config) {
      throw new BadRequestException('Este recurso no es un cuestionario.');
    }

    const borrados = await this.prisma.lms_entregas.deleteMany({
      where: { tarea_guid: recursoGuid, usuario_guid: alumnoGuid, estado: 'CALIFICADA' },
    });
    if (borrados.count === 0) {
      throw new NotFoundException('Este alumno no tiene intentos registrados en el cuestionario.');
    }

    await this.prisma.lms_progreso_recurso.deleteMany({
      where: { usuario_guid: alumnoGuid, recurso_guid: recursoGuid },
    });

    this.logger.log(`${user.email} habilitó un nuevo intento de "${recurso.titulo}" a ${alumnoGuid}`);

    this.eventos.emit('quiz.intento_habilitado', {
      usuario_guid: alumnoGuid,
      pais: user.pais,
      recurso_guid: recursoGuid,
      titulo_quiz: recurso.titulo,
    });

    return { message: 'El alumno puede volver a realizar el cuestionario.' };
  }
}
