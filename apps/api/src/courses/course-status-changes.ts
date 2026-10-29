import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MAIL_CONCURRENCY } from '../mail/mail-transport';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_REF } from '../notifications/notification-ref';
import { CourseAccessInfo } from './course-access.service';
import { parseQuizConfig } from './quiz-config';
import { isAttemptLive } from './quiz.service';
import { Country } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { plural } from '../common/domain/text';
import { CourseStatus } from './dto/courses.dto';

/** Cambios de estado de los que se avisa a los matriculados. */
type StatusChange = 'maintenance' | 'reopening' | 'firstRelease';

/** Aviso en la campana de cada cambio de estado. */
const STATUS_NOTICES = {
  maintenance: (title: string) => ({
    type: 'COURSE_ANNOUNCEMENT' as const,
    title: 'Curso en mantenimiento',
    message: `El curso "${title}" está en mantenimiento. Te avisaremos cuando puedas continuar.`,
  }),
  reopening: (title: string) => ({
    type: 'COURSE_REACTIVATED' as const,
    title: 'Curso disponible de nuevo',
    message: `El curso "${title}" terminó su mantenimiento. Puedes continuar donde lo dejaste.`,
  }),
  firstRelease: (title: string) => ({
    type: 'COURSE_WELCOME' as const,
    title: 'Tu curso ya está disponible',
    message: `"${title}" ya está publicado. Puedes empezar cuando quieras.`,
  }),
} satisfies Record<StatusChange, (title: string) => { type: NotificationType; title: string; message: string }>;

/** Límite de tiempo de un cuestionario guardado; uno dañado se trata como sin límite. */
function timeLimitOf(stored: string | null): number {
  try {
    return parseQuizConfig(stored).timeLimitMinutes;
  } catch {
    return 0;
  }
}

/**
 * El paso de un curso entre Borrador y Publicado: cuándo no se permite, qué cambio es para sus
 * alumnos —mantenimiento, reapertura o primera publicación— y el aviso que reciben.
 */
@Injectable()
export class CourseStatusChanges {
  private readonly logger = new Logger(CourseStatusChanges.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Un curso publicado no vuelve a borrador mientras haya alguien haciendo un examen:
   * el intento quedaría huérfano y el alumno perdería su tiempo y su intento.
   */
  async ensureAllowed(course: CourseAccessInfo, newStatus: CourseStatus): Promise<void> {
    if (course.status !== 'PUBLISHED' || newStatus === 'PUBLISHED') return;

    const examinees = await this.studentsTakingQuizzes(course.guid);
    if (examinees > 0) {
      const who = examinees === 1 ? 'un estudiante está' : `${examinees} estudiantes están`;
      throw new BadRequestException(
        `No se puede pasar a Borrador: ${who} realizando un cuestionario ahora mismo. Espera a que terminen.`,
      );
    }
  }

  /**
   * Alumnos con un intento en marcha (ver `isAttemptLive`) y matrícula activa. Un intento
   * abandonado, o de alguien dado de baja, no puede bloquear el curso indefinidamente.
   */
  private async studentsTakingQuizzes(courseGuid: string): Promise<number> {
    const open = await this.prisma.submission.findMany({
      where: {
        status: 'DRAFT',
        assignment: { module: { courseGuid } },
        user: { enrollments: { some: { courseGuid, active: true } } },
      },
      select: { userGuid: true, assignmentGuid: true, startedAt: true },
    });
    if (open.length === 0) return 0;

    const quizzes = await this.prisma.resource.findMany({
      where: { guid: { in: [...new Set(open.flatMap((attempt) => attempt.assignmentGuid ?? []))] } },
      select: { guid: true, quizConfig: true },
    });
    const timeLimits = new Map(quizzes.map((quiz) => [quiz.guid, timeLimitOf(quiz.quizConfig)]));

    const live = open.filter((attempt) =>
      isAttemptLive(attempt.startedAt, timeLimits.get(attempt.assignmentGuid ?? '') ?? 0),
    );
    return new Set(live.map((attempt) => attempt.userGuid)).size;
  }

  /**
   * Qué supone pasar al nuevo estado y la fecha de primera publicación que queda. Los cursos
   * publicados antes de que existiera esa fecha la reciben al cambiar de estado; mientras no la
   * tengan, el avance o las entregas de sus alumnos prueban que ya se habían publicado.
   */
  async classify(courseGuid: string, newStatus: CourseStatus) {
    const { status, firstPublishedAt } = await this.prisma.course.findUniqueOrThrow({
      where: { guid: courseGuid },
      select: { status: true, firstPublishedAt: true },
    });
    const kind: StatusChange =
      newStatus === 'DRAFT'
        ? 'maintenance'
        : firstPublishedAt || status !== 'DRAFT' || (await this.hasStudentActivity(courseGuid))
          ? 'reopening'
          : 'firstRelease';
    return { kind, firstPublishedAt: firstPublishedAt ?? new Date() };
  }

  /** Si algún alumno ha trabajado ya en el curso: avance y entregas sólo existen con el curso publicado. */
  private async hasStudentActivity(courseGuid: string): Promise<boolean> {
    const inCourse = { module: { courseGuid } };
    const [progress, submission] = await Promise.all([
      this.prisma.resourceProgress.findFirst({ where: { resource: inCourse }, select: { id: true } }),
      this.prisma.submission.findFirst({ where: { assignment: inCourse }, select: { guid: true } }),
    ]);
    return Boolean(progress ?? submission);
  }

  /**
   * Avisa por correo y en la campana a quien tiene el curso en marcha cuando entra en
   * mantenimiento, cuando vuelve a publicarse y cuando se publica por primera vez (a quien se
   * matriculó en el borrador). Quien ya lo terminó no tiene nada que retomar.
   */
  async announce(courseGuid: string, title: string, change: StatusChange, country: Country): Promise<void> {
    const enrolledStudents = await this.prisma.enrollment.findMany({
      where: { courseGuid, active: true, completedAt: null },
      select: { user: { select: { guid: true, email: true, firstName: true } } },
    });
    if (enrolledStudents.length === 0) return;

    const notice = STATUS_NOTICES[change](title);

    // Los avisos no bloquean la respuesta: publicar un curso no puede depender del servidor
    // de correo. Salen de pocos en pocos: un curso puede tener miles de matriculados.
    void settleWithConcurrency(enrolledStudents, MAIL_CONCURRENCY, ({ user }) =>
      Promise.all([
        this.notifications.create({
          ...notice,
          userGuid: user.guid,
          country,
          actionUrl: `/courses/${courseGuid}`,
          refType: NOTIFICATION_REF.course,
          refGuid: courseGuid,
        }),
        this.sendStatusMail(change, user, title, courseGuid, country),
      ]),
    ).then((results) => {
      const failed = countRejected(results);
      if (failed > 0) {
        this.logger.error(
          `Fallo al avisar a ${failed} ${plural(failed, 'matriculado', 'matriculados')} del cambio de estado de ${courseGuid}`,
        );
      }
    });
  }

  private sendStatusMail(
    change: StatusChange,
    user: { email: string; firstName: string },
    title: string,
    courseGuid: string,
    country: Country,
  ) {
    switch (change) {
      case 'maintenance':
        return this.mail.sendCourseUnderMaintenance(user.email, user.firstName, title, country);
      case 'reopening':
        return this.mail.sendCourseReactivated(user.email, user.firstName, title, country);
      case 'firstRelease':
        // Es el correo de matrícula, que se reservó hasta que el curso estuviera publicado.
        return this.mail.sendEnrollment(user.email, user.firstName, title, courseGuid, country);
    }
  }
}
