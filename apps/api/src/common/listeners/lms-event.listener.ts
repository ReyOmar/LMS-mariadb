import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { MailService } from '../../mail/mail.service';
import { CertificadosService } from '../../certificados/certificados.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { formatearNota, formatearPuntos } from '../domain/calificacion';
import { Pais } from '../domain/pais';

/** Datos comunes a todos los eventos: quién y en qué sede. */
interface EventoBase {
  usuario_guid: string;
  pais: Pais;
}

export interface QuizAprobado extends EventoBase {
  recurso_guid: string;
  curso_guid: string;
  nota: number;
  titulo_quiz: string;
}

export interface QuizSuspendido extends EventoBase {
  recurso_guid: string;
  curso_guid: string;
  curso_titulo: string;
  profesor_guid: string;
  nota: number;
  nota_aprobacion: number;
  titulo_quiz: string;
}

export interface IntentoHabilitado extends EventoBase {
  recurso_guid: string;
  titulo_quiz: string;
}

export interface EntregaRecibida extends EventoBase {
  entrega_guid: string;
  tarea_titulo: string;
  curso_titulo: string;
  profesor_guid: string;
  es_reenvio: boolean;
  nota_anterior: number | null;
}

export interface EntregaCalificada extends EventoBase {
  entrega_guid: string;
  tarea_guid: string | null;
  curso_guid: string;
  tarea_titulo: string;
  nota: number;
  nota_aprobacion: number;
  aprobada: boolean;
  comentario: string | null;
}

export interface ProgresoActualizado extends EventoBase {
  curso_guid: string;
}

/**
 * Efectos colaterales de los eventos de dominio: avisos en la aplicación, correos y
 * comprobación de fin de curso.
 *
 * Los servicios de dominio emiten un evento y siguen: no saben nada de correos ni de
 * certificados. Eso mantiene una sola razón de cambio por servicio y, sobre todo, hace que
 * un fallo del servidor de correo no pueda deshacer una calificación ya guardada.
 *
 * Todo lo que ocurre aquí se captura: un error en un aviso se registra pero nunca se
 * propaga a la petición que lo originó, que ya terminó.
 */
@Injectable()
export class LmsEventListener {
  private readonly logger = new Logger(LmsEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly mail: MailService,
    private readonly certificados: CertificadosService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Cuestionarios ────────────────────────────────────────────────────────

  @OnEvent('quiz.aprobado')
  async alAprobarQuiz(evento: QuizAprobado): Promise<void> {
    await this.protegido('quiz.aprobado', async () => {
      await this.notificaciones.crear({
        usuario_guid: evento.usuario_guid,
        pais: evento.pais,
        tipo: 'TAREA_CALIFICADA',
        titulo: 'Cuestionario aprobado',
        mensaje: `Obtuviste ${formatearNota(evento.nota)} en "${evento.titulo_quiz}". ¡Buen trabajo!`,
        ref_tipo: 'quiz',
        ref_guid: evento.recurso_guid,
      });

      await this.certificados.emitirSiProcede(evento.curso_guid, evento.usuario_guid, evento.pais);
    });
  }

  @OnEvent('quiz.suspendido')
  async alSuspenderQuiz(evento: QuizSuspendido): Promise<void> {
    await this.protegido('quiz.suspendido', async () => {
      const alumno = await this.prisma.usuarios.findUnique({
        where: { guid: evento.usuario_guid },
        select: { nombre: true, apellido: true, email: true },
      });
      const nombreAlumno = alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Un alumno';

      await Promise.all([
        this.notificaciones.crear({
          usuario_guid: evento.usuario_guid,
          pais: evento.pais,
          tipo: 'ENTREGA_RECHAZADA',
          titulo: 'Cuestionario no superado',
          mensaje:
            `Obtuviste ${formatearNota(evento.nota)} en "${evento.titulo_quiz}" y se requieren ` +
            `${formatearPuntos(evento.nota_aprobacion)} puntos. Repasa el módulo y vuelve a intentarlo.`,
          ref_tipo: 'quiz',
          ref_guid: evento.recurso_guid,
        }),
        this.notificaciones.crear({
          usuario_guid: evento.profesor_guid,
          pais: evento.pais,
          tipo: 'REVISION_ENTREGA',
          titulo: 'Cuestionario no superado',
          mensaje: `${nombreAlumno} obtuvo ${formatearNota(evento.nota)} en "${evento.titulo_quiz}" del curso "${evento.curso_titulo}".`,
          ref_tipo: 'quiz',
          ref_guid: evento.recurso_guid,
        }),
      ]);

      if (alumno) {
        await this.mail.sendQuizFailedModuleReset(
          alumno.email,
          alumno.nombre,
          evento.titulo_quiz,
          evento.curso_titulo,
          evento.nota,
          evento.pais,
        );
      }
    });
  }

  @OnEvent('quiz.intento_habilitado')
  async alHabilitarIntento(evento: IntentoHabilitado): Promise<void> {
    await this.protegido('quiz.intento_habilitado', async () => {
      await this.notificaciones.crear({
        usuario_guid: evento.usuario_guid,
        pais: evento.pais,
        tipo: 'EVALUACION_NUEVA',
        titulo: 'Nuevo intento disponible',
        mensaje: `Tu examinador te ha habilitado un nuevo intento en "${evento.titulo_quiz}".`,
        ref_tipo: 'quiz',
        ref_guid: evento.recurso_guid,
      });
    });
  }

  // ── Entregas ─────────────────────────────────────────────────────────────

  @OnEvent('entrega.recibida')
  async alRecibirEntrega(evento: EntregaRecibida): Promise<void> {
    await this.protegido('entrega.recibida', async () => {
      const [alumno, examinador] = await Promise.all([
        this.prisma.usuarios.findUnique({
          where: { guid: evento.usuario_guid },
          select: { nombre: true, apellido: true },
        }),
        this.prisma.usuarios.findUnique({
          where: { guid: evento.profesor_guid },
          select: { nombre: true, email: true },
        }),
      ]);
      const nombreAlumno = alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Un alumno';

      const detalle = evento.es_reenvio
        ? ` Es un reenvío; la entrega anterior obtuvo ${formatearNota(evento.nota_anterior)}.`
        : '';

      await this.notificaciones.crear({
        usuario_guid: evento.profesor_guid,
        pais: evento.pais,
        tipo: evento.es_reenvio ? 'REVISION_ENTREGA' : 'EVALUACION_NUEVA',
        titulo: evento.es_reenvio ? 'Entrega corregida por el alumno' : 'Nueva entrega para calificar',
        mensaje: `${nombreAlumno} envió "${evento.tarea_titulo}" del curso "${evento.curso_titulo}".${detalle}`,
        url_accion: '/dashboard/examiner/calificaciones',
        ref_tipo: 'entrega',
        ref_guid: evento.entrega_guid,
      });

      // Sólo se avisa al examinador responsable, dentro de su sede.
      this.realtime.emitirAUsuarios(
        'submission:new',
        { entrega_guid: evento.entrega_guid, tarea_titulo: evento.tarea_titulo },
        evento.pais,
        [evento.profesor_guid],
      );

      if (examinador) {
        await this.mail.sendNewSubmissionNotification(
          examinador.email,
          examinador.nombre,
          nombreAlumno,
          evento.tarea_titulo,
          evento.curso_titulo,
          evento.pais,
        );
      }
    });
  }

  @OnEvent('entrega.calificada')
  async alCalificarEntrega(evento: EntregaCalificada): Promise<void> {
    await this.protegido('entrega.calificada', async () => {
      const alumno = await this.prisma.usuarios.findUnique({
        where: { guid: evento.usuario_guid },
        select: { nombre: true, email: true },
      });

      const comentario = evento.comentario ? ` Comentario: ${evento.comentario}` : '';

      await this.notificaciones.crear({
        usuario_guid: evento.usuario_guid,
        pais: evento.pais,
        tipo: evento.aprobada ? 'TAREA_CALIFICADA' : 'ENTREGA_RECHAZADA',
        titulo: evento.aprobada ? 'Tarea aprobada' : 'Tarea no aprobada',
        mensaje: evento.aprobada
          ? `Tu entrega de "${evento.tarea_titulo}" obtuvo ${formatearNota(evento.nota)}.${comentario}`
          : `Tu entrega de "${evento.tarea_titulo}" obtuvo ${formatearNota(evento.nota)} y se requieren ` +
            `${formatearPuntos(evento.nota_aprobacion)} puntos. Puedes subir una nueva versión.${comentario}`,
        url_accion: '/dashboard/student/cursos',
        ref_tipo: 'entrega',
        ref_guid: evento.entrega_guid,
      });

      if (alumno) {
        await (evento.aprobada
          ? this.mail.sendGradeNotification(
              alumno.email,
              alumno.nombre,
              evento.tarea_titulo,
              evento.nota,
              evento.nota_aprobacion,
              evento.pais,
            )
          : this.mail.sendSubmissionRejected(
              alumno.email,
              alumno.nombre,
              evento.tarea_titulo,
              evento.nota,
              evento.pais,
              evento.comentario,
            ));
      }

      if (evento.aprobada) {
        await this.certificados.emitirSiProcede(evento.curso_guid, evento.usuario_guid, evento.pais);
      }
    });
  }

  // ── Progreso ─────────────────────────────────────────────────────────────

  @OnEvent('progreso.actualizado')
  async alAvanzar(evento: ProgresoActualizado): Promise<void> {
    await this.protegido('progreso.actualizado', () =>
      this.certificados.emitirSiProcede(evento.curso_guid, evento.usuario_guid, evento.pais),
    );
  }

  /**
   * Ejecuta el manejador registrando cualquier fallo.
   *
   * Un error aquí ocurre después de que la petición del usuario haya terminado: dejarlo
   * escapar produciría un rechazo de promesa sin capturar que, según la configuración de
   * Node, puede tumbar el proceso.
   */
  private async protegido(evento: string, manejador: () => Promise<void>): Promise<void> {
    try {
      await manejador();
    } catch (error) {
      this.logger.error(`Fallo procesando el evento ${evento}`, error);
    }
  }
}
