import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CourseAccessService } from '../courses/course-access.service';
import { recordCompletion, refreshCompletedResources } from '../courses/resource-progress';
import { QuizConfig, parseQuizConfig, quizDisplayTitle } from '../courses/quiz-config';
import { attemptsExhausted, usedAttempts } from '../courses/quiz.service';
import { AFTER_LOCK, ClosedRoundMessages, assertRoundOpen, lockEnrollment } from '../enrollments/enrollment-lock';
import { normalizeScore, passingThreshold } from '../common/domain/grading';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { emitEvent } from '../common/domain/domain-events';

const GRADING_CLOSED: ClosedRoundMessages = {
  unenrolled: 'Este alumno ya no está matriculado en el curso: no puedes calificar su entrega.',
  certified: 'La vuelta de este alumno ya está certificada: su calificación no puede cambiarse.',
};

const NEW_ATTEMPT_CLOSED: ClosedRoundMessages = {
  unenrolled: 'Este alumno ya no está matriculado en el curso: no puedes habilitarle otro intento.',
  certified: 'La vuelta de este alumno ya está certificada: no puedes habilitarle otro intento.',
};

/** Lo que decide el examinador sobre el trabajo de un alumno: la nota de una tarea y otro intento de cuestionario. */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Califica una entrega. Sólo puede hacerlo el responsable del curso.
   *
   * Aprobar marca el recurso como superado y dispara la comprobación de fin de curso.
   * Suspender deja la tarea pendiente para que el alumno pueda reenviarla y le retira el
   * avance que tuviera en ella —por un aprobado anterior o por el desbloqueo por espera—:
   * si no, una tarea suspendida contaría como completada para el certificado.
   *
   * A quien se dio de baja o ya tiene el certificado de esta vuelta no se le califica: la nota
   * movería el avance de una vuelta cerrada. Y la nota es de la versión que revisó el
   * examinador: si el alumno la sustituyó entretanto, no se guarda.
   */
  async gradeSubmission(submissionGuid: string, dto: GradeSubmissionDto, user: JwtPayload) {
    const { submission, course } = await this.access.managedCourseOfSubmission(submissionGuid, user);

    // La nota de un cuestionario la pone la corrección automática, y el aprobado de cualquiera
    // de sus intentos es el que cuenta: cambiarla a mano podría retirarle a quien lo superó.
    if (submission.assignment?.quizConfig) {
      throw new BadRequestException('Los cuestionarios se califican automáticamente: su nota no se cambia a mano.');
    }

    const threshold = passingThreshold(course.passingScore);
    const score = normalizeScore(dto.score);
    const passed = score >= threshold;
    const feedback = dto.feedback?.trim() || null;

    // Con la matrícula bloqueada: dos calificaciones a la vez se aplican una detrás de otra,
    // y la nota y el avance de la tarea quedan los dos de acuerdo con la última. Por
    // separado, la nota podía ser un suspenso con el avance de un aprobado.
    await this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, submission.userGuid, course.guid), GRADING_CLOSED);

      const reviewed = await tx.submission.updateMany({
        where: { guid: submissionGuid, submittedAt: new Date(dto.submittedAt) },
        data: { status: 'GRADED', score, feedback },
      });
      if (reviewed.count === 0) {
        throw new ConflictException(
          'El alumno envió una versión nueva de esta entrega mientras la revisabas. Ábrela de nuevo para calificar la que está ahora.',
        );
      }

      if (!submission.assignmentGuid) return;
      if (passed) {
        await recordCompletion(tx, submission.userGuid, submission.assignmentGuid, course.guid);
      } else {
        await tx.resourceProgress.deleteMany({
          where: { userGuid: submission.userGuid, resourceGuid: submission.assignmentGuid },
        });
        await refreshCompletedResources(tx, submission.userGuid, course.guid);
      }
    }, AFTER_LOCK);

    const graded = { submissionGuid, assignmentGuid: submission.assignmentGuid, score, passed };
    this.realtime.emitToUsers('submission:graded', graded, user.country, [submission.userGuid]);
    this.realtime.emitToCourseStaff('submission:graded', graded, user.country, course.teacherGuid);

    emitEvent(this.events, 'submission.graded', {
      submissionGuid,
      userGuid: submission.userGuid,
      country: user.country,
      courseGuid: course.guid,
      assignmentGuid: submission.assignmentGuid,
      assignmentTitle: submission.assignment?.title ?? 'Tarea',
      score,
      passingScore: threshold,
      passed,
      feedback,
    });

    return { guid: submissionGuid, score, passed, passingScore: threshold };
  }

  /**
   * Devuelve **un** intento de cuestionario a un alumno que agotó los suyos sin superarlo.
   *
   * Es la vía de escape del examinador cuando alguien pierde un intento por un problema de
   * conexión o de dispositivo. Se retira únicamente el último intento registrado, porque
   * el recuento se lleva contando entregas: borrarlas todas repondría todos los intentos y
   * se llevaría el historial que el examinador consulta.
   */
  async enableNewAttempt(resourceGuid: string, studentGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourseOfResource(resourceGuid, user);

    const resource = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { title: true, quizConfig: true },
    });
    if (!resource?.quizConfig) {
      throw new BadRequestException('Este recurso no es un cuestionario.');
    }
    const config = parseQuizConfig(resource.quizConfig);

    // Con la matrícula bloqueada, como al abrir y corregir intentos: nadie cuenta a la vez los que quedan.
    await this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, studentGuid, course.guid), NEW_ATTEMPT_CLOSED);
      await this.discardLastAttempt(tx, { resourceGuid, studentGuid, config });
    }, AFTER_LOCK);

    const quizTitle = quizDisplayTitle(resource.title);
    this.logger.log(`${user.email} habilitó un nuevo intento de "${quizTitle}" a ${studentGuid}`);

    // Si tiene el cuestionario abierto, el «has agotado tus intentos» se cambia por el botón
    // de empezar sin que tenga que recargar.
    this.realtime.emitToUsers('quiz:attempt-enabled', { resourceGuid, courseGuid: course.guid }, user.country, [
      studentGuid,
    ]);
    emitEvent(this.events, 'quiz.attempt_enabled', {
      userGuid: studentGuid,
      country: user.country,
      resourceGuid,
      courseGuid: course.guid,
      quizTitle,
    });

    return { message: 'El alumno puede volver a realizar el cuestionario.' };
  }

  /** Retira el último intento calificado; nunca el de quien ya superó el cuestionario ni a quien le quedan. */
  private async discardLastAttempt(
    tx: Prisma.TransactionClient,
    { resourceGuid, studentGuid, config }: { resourceGuid: string; studentGuid: string; config: QuizConfig },
  ): Promise<void> {
    const passed = await tx.resourceProgress.findUnique({
      where: { userGuid_resourceGuid: { userGuid: studentGuid, resourceGuid } },
      select: { id: true },
    });
    if (passed) {
      throw new BadRequestException('Este alumno ya superó el cuestionario: su intento aprobado no se retira.');
    }

    const last = await tx.submission.findFirst({
      where: { assignmentGuid: resourceGuid, userGuid: studentGuid, status: 'GRADED' },
      orderBy: [{ attemptNumber: 'desc' }, { submittedAt: 'desc' }],
      select: { guid: true },
    });
    if (!last) {
      throw new NotFoundException('Este alumno no tiene intentos registrados en el cuestionario.');
    }

    const used = await tx.submission.count({ where: usedAttempts(resourceGuid, studentGuid) });
    if (!attemptsExhausted(config, used)) {
      throw new BadRequestException(
        'A este alumno todavía le quedan intentos: puede volver a presentar el cuestionario sin que le habilites otro.',
      );
    }

    await tx.submission.delete({ where: { guid: last.guid } });
  }
}
