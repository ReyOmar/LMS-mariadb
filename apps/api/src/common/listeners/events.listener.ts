import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { MailService } from '../../mail/mail.service';
import { CertificatesService } from '../../certificates/certificates.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { formatScore, formatPoints } from '../domain/grading';
import {
  SubmissionGraded,
  SubmissionReceived,
  BaseEvent,
  AttemptEnabled,
  DomainEvents,
  ProgressUpdated,
  QuizPassed,
  QuizFailed,
} from '../domain/domain-events';

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
export class EventsListener {
  private readonly logger = new Logger(EventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly certificates: CertificatesService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Cuestionarios ────────────────────────────────────────────────────────

  @OnEvent('quiz.passed')
  async onQuizPassed(event: QuizPassed): Promise<void> {
    await this.checkCertificate('quiz.passed', event);

    await this.runSafely('quiz.passed', async () => {
      await this.notifications.create({
        userGuid: event.userGuid,
        country: event.country,
        type: 'ASSIGNMENT_GRADED',
        title: 'Cuestionario aprobado',
        message: `Obtuviste ${formatScore(event.score)} en "${event.quizTitle}". ¡Buen trabajo!`,
        actionUrl: `/courses/${event.courseGuid}`,
        refType: 'quiz',
        refGuid: event.resourceGuid,
      });
    });
  }

  @OnEvent('quiz.failed')
  async onQuizFailed(event: QuizFailed): Promise<void> {
    await this.runSafely('quiz.failed', async () => {
      const [student, quiz] = await Promise.all([
        this.prisma.user.findUnique({
          where: { guid: event.userGuid },
          select: { firstName: true, lastName: true, email: true },
        }),
        this.prisma.resource.findUnique({
          where: { guid: event.resourceGuid },
          select: { module: { select: { title: true } } },
        }),
      ]);
      const studentName = student ? `${student.firstName} ${student.lastName}` : 'Un alumno';

      await Promise.all([
        this.notifications.create({
          userGuid: event.userGuid,
          country: event.country,
          type: 'MODULE_RESET',
          title: 'Cuestionario no superado',
          message:
            `Obtuviste ${formatScore(event.score)} en "${event.quizTitle}" y se requieren ` +
            `${formatPoints(event.passingScore)} puntos. Repasa el módulo y vuelve a intentarlo.`,
          actionUrl: `/courses/${event.courseGuid}`,
          refType: 'quiz',
          refGuid: event.resourceGuid,
        }),
        this.notifications.create({
          userGuid: event.teacherGuid,
          country: event.country,
          type: 'SUBMISSION_REVIEW',
          title: 'Cuestionario no superado',
          message: `${studentName} obtuvo ${formatScore(event.score)} en "${event.quizTitle}" del curso "${event.courseTitle}".`,
          // El examinador revisa los intentos en su panel, no en la vista del alumno.
          actionUrl: '/dashboard/examiner/quizzes',
          refType: 'quiz',
          refGuid: event.resourceGuid,
        }),
      ]);

      if (student) {
        // El correo explica que el alumno vuelve al inicio del módulo, así que nombra el
        // módulo; el curso sólo si el recurso ya no existe.
        await this.mail.sendQuizFailed(
          student.email,
          student.firstName,
          event.quizTitle,
          quiz?.module.title ?? event.courseTitle,
          event.score,
          event.country,
        );
      }
    });
  }

  @OnEvent('quiz.attempt_enabled')
  async onAttemptEnabled(event: AttemptEnabled): Promise<void> {
    await this.runSafely('quiz.attempt_enabled', async () => {
      await this.notifications.create({
        userGuid: event.userGuid,
        country: event.country,
        type: 'NEW_ASSESSMENT',
        title: 'Nuevo intento disponible',
        message: `Tu examinador te ha habilitado un nuevo intento en "${event.quizTitle}".`,
        actionUrl: `/courses/${event.courseGuid}`,
        refType: 'quiz',
        refGuid: event.resourceGuid,
      });
    });
  }

  // ── Entregas ─────────────────────────────────────────────────────────────

  @OnEvent('submission.received')
  async onSubmissionReceived(event: SubmissionReceived): Promise<void> {
    await this.runSafely('submission.received', async () => {
      const [student, examiner] = await Promise.all([
        this.prisma.user.findUnique({
          where: { guid: event.userGuid },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.user.findUnique({
          where: { guid: event.teacherGuid },
          select: { firstName: true, email: true },
        }),
      ]);
      const studentName = student ? `${student.firstName} ${student.lastName}` : 'Un alumno';

      const detail = event.isResubmission
        ? ` Es un reenvío; la entrega anterior obtuvo ${formatScore(event.previousScore)}.`
        : '';

      await this.notifications.create({
        userGuid: event.teacherGuid,
        country: event.country,
        type: event.isResubmission ? 'SUBMISSION_REVIEW' : 'NEW_ASSESSMENT',
        title: event.isResubmission ? 'Entrega corregida por el alumno' : 'Nueva entrega para calificar',
        message: `${studentName} envió "${event.assignmentTitle}" del curso "${event.courseTitle}".${detail}`,
        actionUrl: '/dashboard/examiner/grading',
        refType: 'entrega',
        refGuid: event.submissionGuid,
      });

      this.realtime.emitToCourseStaff(
        'submission:new',
        { submissionGuid: event.submissionGuid, assignmentTitle: event.assignmentTitle },
        event.country,
        event.teacherGuid,
      );

      if (examiner) {
        await this.mail.sendNewSubmission(
          examiner.email,
          examiner.firstName,
          studentName,
          event.assignmentTitle,
          event.courseTitle,
          event.country,
        );
      }
    });
  }

  @OnEvent('submission.graded')
  async onSubmissionGraded(event: SubmissionGraded): Promise<void> {
    if (event.passed) await this.checkCertificate('submission.graded', event);

    await this.runSafely('submission.graded', async () => {
      const student = await this.prisma.user.findUnique({
        where: { guid: event.userGuid },
        select: { firstName: true, email: true },
      });

      const feedback = event.feedback ? ` Comentario: ${event.feedback}` : '';

      await this.notifications.create({
        userGuid: event.userGuid,
        country: event.country,
        type: event.passed ? 'ASSIGNMENT_GRADED' : 'SUBMISSION_REJECTED',
        title: event.passed ? 'Tarea aprobada' : 'Tarea no aprobada',
        message: event.passed
          ? `Tu entrega de "${event.assignmentTitle}" obtuvo ${formatScore(event.score)}.${feedback}`
          : `Tu entrega de "${event.assignmentTitle}" obtuvo ${formatScore(event.score)} y se requieren ` +
            `${formatPoints(event.passingScore)} puntos. Puedes subir una nueva versión.${feedback}`,
        actionUrl: '/dashboard/student/courses',
        refType: 'entrega',
        refGuid: event.submissionGuid,
      });

      if (student) {
        await (event.passed
          ? this.mail.sendGrade(
              student.email,
              student.firstName,
              event.assignmentTitle,
              event.score,
              event.country,
              event.feedback,
            )
          : this.mail.sendSubmissionRejected(
              student.email,
              student.firstName,
              event.assignmentTitle,
              event.score,
              event.country,
              event.feedback,
            ));
      }
    });
  }

  // ── Progreso ─────────────────────────────────────────────────────────────

  @OnEvent('progress.updated')
  async onProgressUpdated(event: ProgressUpdated): Promise<void> {
    await this.checkCertificate('progress.updated', event);
  }

  /**
   * Emite el certificado si el alumno acaba de cerrar el curso.
   *
   * Va aparte de los avisos y antes que ellos: si un fallo al avisar saltara la emisión y
   * aquella era la última tarea del curso, no llegaría ningún evento más que la reintentara.
   */
  private checkCertificate(origin: keyof DomainEvents, event: BaseEvent & { courseGuid: string }): Promise<void> {
    return this.runSafely(
      origin,
      () => this.certificates.issueIfEligible(event.courseGuid, event.userGuid, event.country),
      'certificado',
    );
  }

  /**
   * Ejecuta el manejador registrando cualquier fallo.
   *
   * Un error aquí ocurre después de que la petición del usuario haya terminado: dejarlo
   * escapar produciría un rechazo de promesa sin capturar que, según la configuración de
   * Node, puede tumbar el proceso.
   */
  private async runSafely(event: keyof DomainEvents, handler: () => Promise<void>, task = 'avisos'): Promise<void> {
    try {
      await handler();
    } catch (error) {
      this.logger.error(`Fallo procesando el evento ${event} (${task})`, error);
    }
  }
}
