import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Submission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService, UNENROLLED_MESSAGE } from '../courses/course-access.service';
import {
  AFTER_LOCK,
  ClosedRoundMessages,
  LockedEnrollment,
  assertRoundOpen,
  lockEnrollment,
} from '../enrollments/enrollment-lock';
import { toScore, isPassing, formatScore, passingThreshold } from '../common/domain/grading';
import { Country } from '../common/domain/country';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { FileReceiver } from '../storage/multipart';
import { uploadLimit } from '../storage/upload-limits';
import { emitEvent } from '../common/domain/domain-events';
import { deliveredFileUrl } from './delivered-file';

const SUBMISSIONS_CLOSED: ClosedRoundMessages = {
  unenrolled: UNENROLLED_MESSAGE,
  certified: 'Ya terminaste este curso: tus entregas quedaron cerradas con tu certificado.',
};

/** Lo que se mira de la entrega anterior de un alumno al recibir otra. */
const OWN_SUBMISSION_SELECT = {
  guid: true,
  status: true,
  score: true,
  attachmentKey: true,
} satisfies Prisma.SubmissionSelect;

type OwnSubmission = Prisma.SubmissionGetPayload<{ select: typeof OWN_SUBMISSION_SELECT }>;

/** Una entrega aprobada no se sustituye: respalda una nota ya dada. */
function ensureReplaceable(previous: OwnSubmission | null, threshold: number, country: Country): void {
  if (previous?.status === 'GRADED' && isPassing(previous.score, threshold)) {
    throw new BadRequestException(
      `Tu entrega ya fue aprobada con ${formatScore(previous.score, country)}. No necesitas volver a enviarla.`,
    );
  }
}

/** Las entregas de tareas del alumno: subirlas, sustituirlas mientras no estén aprobadas y consultarlas. */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: CourseAccessService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    private readonly files: FileOwnershipService,
  ) {}

  /**
   * Registra la entrega de una tarea. Se puede reenviar mientras no esté aprobada: una aprobada
   * no se sustituye, porque respalda una nota ya dada. El archivo se recibe al final, cuando ya
   * se sabe que la entrega procede y cuál es su límite (el de la tarea o el general de la sede).
   */
  async recordSubmission(assignmentGuid: string, receive: FileReceiver, user: JwtPayload) {
    const course = await this.access.unlockedResourceAccess(assignmentGuid, user);
    const threshold = passingThreshold(course.passingScore);

    const assignment = await this.prisma.resource.findUnique({
      where: { guid: assignmentGuid },
      select: { title: true, type: true, quizConfig: true, maxUploadMb: true },
    });
    if (!assignment || assignment.type !== 'ASSIGNMENT') {
      throw new BadRequestException('Este recurso no admite entregas.');
    }
    if (assignment.quizConfig) {
      throw new BadRequestException('Este recurso es un cuestionario: se resuelve en línea, no se sube archivo.');
    }

    // Antes de recibir el archivo, para no aceptar en balde uno que puede pesar varios GB.
    assertRoundOpen(await this.enrollmentOf(user.sub, course.guid), SUBMISSIONS_CLOSED);
    ensureReplaceable(await this.ownSubmission(this.prisma, assignmentGuid, user.sub), threshold, user.country);

    const limit = uploadLimit('entregas', assignment.maxUploadMb ?? (await this.settings.getMaxUploadMb(user.country)));
    const file = await receive(limit);
    const key = await this.storage.uploadFromDisk(file.filePath, file.name, 'entregas', user, limit.bytes);

    const attachment = { attachmentKey: key, attachmentName: file.name };
    const { submission, previous } = await this.files.adoptUpload(
      key,
      () =>
        this.saveDelivery(
          { assignmentGuid, courseGuid: course.guid, userGuid: user.sub, country: user.country, threshold },
          attachment,
        ),
      (saved) => saved.previous?.attachmentKey,
    );

    emitEvent(this.events, 'submission.received', {
      submissionGuid: submission.guid,
      userGuid: user.sub,
      country: user.country,
      assignmentTitle: assignment.title,
      courseTitle: course.title,
      teacherGuid: course.teacherGuid,
      isResubmission: submission.status === 'IN_REVIEW',
      previousScore: toScore(previous?.score),
    });

    return this.forStudent(submission);
  }

  /**
   * Con la matrícula bloqueada: dos envíos a la vez se ponen en fila y el segundo sustituye al
   * primero, y uno que llega tras la baja, el certificado o un suspenso que devolvió al alumno
   * al principio del módulo se rechaza.
   */
  private saveDelivery(
    target: { assignmentGuid: string; courseGuid: string; userGuid: string; country: Country; threshold: number },
    attachment: { attachmentKey: string; attachmentName: string },
  ) {
    const { assignmentGuid, courseGuid, userGuid, country, threshold } = target;
    return this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, userGuid, courseGuid), SUBMISSIONS_CLOSED);
      await this.access.ensureUnlocked(courseGuid, assignmentGuid, userGuid, tx);
      const previous = await this.ownSubmission(tx, assignmentGuid, userGuid);
      ensureReplaceable(previous, threshold, country);

      const delivery = { ...attachment, submittedAt: new Date() };
      const submission = previous
        ? await tx.submission.update({
            where: { guid: previous.guid },
            // Una versión corregida tras una nota insuficiente sigue siendo un reenvío
            // aunque se sustituya antes de que la califiquen.
            data: {
              ...delivery,
              status: previous.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_REVIEW',
              filePurged: false,
            },
          })
        : await tx.submission.create({ data: { ...delivery, assignmentGuid, userGuid, status: 'SUBMITTED' } });
      return { submission, previous };
    }, AFTER_LOCK);
  }

  private enrollmentOf(userGuid: string, courseGuid: string): Promise<LockedEnrollment | null> {
    return this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { active: true, completedAt: true },
    });
  }

  /** La entrega del alumno en una tarea, si ya la tiene: cada tarea admite una por alumno. */
  private ownSubmission(db: Prisma.TransactionClient, assignmentGuid: string, userGuid: string) {
    return db.submission.findFirst({ where: { assignmentGuid, userGuid }, select: OWN_SUBMISSION_SELECT });
  }

  /** Entrega del alumno en sesión para una tarea concreta. */
  async getMySubmission(assignmentGuid: string, user: JwtPayload) {
    await this.access.ensureResourceAccess(assignmentGuid, user);

    const submission = await this.prisma.submission.findFirst({
      where: { assignmentGuid, userGuid: user.sub },
    });
    return submission ? this.forStudent(submission) : { status: 'PENDING' as const };
  }

  /** Proyección de una entrega hacia su autor. */
  private forStudent(
    submission: Pick<
      Submission,
      | 'guid'
      | 'status'
      | 'submittedAt'
      | 'attachmentName'
      | 'attachmentKey'
      | 'score'
      | 'feedback'
      | 'filePurged'
      | 'attemptNumber'
    >,
  ) {
    return {
      guid: submission.guid,
      status: submission.status,
      submittedAt: submission.submittedAt,
      fileName: submission.attachmentName,
      fileUrl: deliveredFileUrl(this.storage, submission),
      filePurged: submission.filePurged,
      score: toScore(submission.score),
      feedback: submission.feedback,
      attemptNumber: submission.attemptNumber,
    };
  }
}
