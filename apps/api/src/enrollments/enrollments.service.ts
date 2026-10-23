import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseAccessInfo, CourseAccessService } from '../courses/course-access.service';
import { encodeCursor, ROWS_PER_PAGE, decodeCursor } from '../common/domain/pagination';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MIN_SEARCH_LENGTH } from '../common/domain/search';
import { personSearch } from '../prisma/person-search';
import { MIN_SCORE } from '../common/domain/grading';
import { plural } from '../common/domain/text';
import { SubmissionFilesService } from '../certificates/submission-files.service';
import { lockCourseCapacity, occupiedSeats } from './course-capacity';
import { NOTIFICATION_REF } from '../notifications/notification-ref';

/** Candidatos que se ofrecen de una vez; con más, se afina la búsqueda. */
const VISIBLE_CANDIDATES = 50;

/** Nota con la que se cierra un intento de cuestionario abierto al dar de baja. */
const CLOSED_ATTEMPT_FEEDBACK = 'Intento cerrado por la baja de la matrícula.';

/**
 * Matrículas de alumnos en cursos.
 *
 * La invariante que se defiende aquí es que **alumno y curso pertenecen a la misma sede**.
 * Es el único punto del sistema donde podrían cruzarse los datos de Colombia y México: el
 * progreso, las entregas y los certificados sólo se crean para quien está matriculado.
 *
 * Una baja no borra la fila, sólo la desactiva: para todo lo demás —listados, contenido,
 * paneles— quien está de baja no está matriculado.
 */
@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly submissionFiles: SubmissionFilesService,
  ) {}

  /**
   * Alumnos matriculados en un curso, por página. La página avanza con una marca de la
   * última matrícula entregada; ver `common/domain/pagination`.
   */
  async getEnrolledStudents(courseGuid: string, user: JwtPayload, cursor?: string) {
    await this.access.managedCourse(courseGuid, user);

    const position = decodeCursor(cursor);
    const positionId = Number(position?.id);
    const fromCursor =
      position && Number.isInteger(positionId)
        ? {
            OR: [{ enrolledAt: { lt: position.date } }, { enrolledAt: position.date, id: { lt: positionId } }],
          }
        : {};

    const enrolled = { courseGuid, active: true };
    const rows = await this.prisma.enrollment.findMany({
      where: { ...enrolled, ...fromCursor },
      select: {
        id: true,
        active: true,
        enrolledAt: true,
        user: { select: { guid: true, firstName: true, lastName: true, email: true, lastAccessAt: true } },
      },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      take: ROWS_PER_PAGE + 1, // uno de más para saber si queda algo por traer
    });

    const hasMore = rows.length > ROWS_PER_PAGE;
    const page = hasMore ? rows.slice(0, ROWS_PER_PAGE) : rows;
    const last = page[page.length - 1];

    return {
      // El total sólo se cuenta en la primera página: recorre el curso entero.
      ...(cursor ? {} : { total: await this.prisma.enrollment.count({ where: enrolled }) }),
      cursor: hasMore && last ? encodeCursor(last.enrolledAt, last.id) : null,
      enrolledStudents: page.map((row) => ({ ...row.user, active: row.active, enrolledAt: row.enrolledAt })),
    };
  }

  /**
   * Alumnos de la sede que no están matriculados en el curso, incluidos los que se dieron
   * de baja: es la vía para volver a matricularlos.
   *
   * `certified` avisa de que el alumno terminó su vuelta en el curso: matricularlo otra vez
   * abre una vuelta nueva, que reinicia su avance y archiva sus notas (ver `startNewRound`),
   * así que la pantalla lo pide confirmar antes. Un certificado de una vuelta anterior no
   * cuenta: quien se quedó a medias en la siguiente la retoma.
   *
   * Sin texto se listan los primeros de la sede; con una sola letra no se busca: casa con
   * casi todos y recorre la sede entera para devolver lo mismo que sin filtro.
   */
  async getCandidates(courseGuid: string, user: JwtPayload, search?: string) {
    await this.access.managedCourse(courseGuid, user);

    const typed = search?.trim() ?? '';
    if (typed.length > 0 && typed.length < MIN_SEARCH_LENGTH) return [];

    const candidates = await this.prisma.user.findMany({
      where: {
        country: user.country,
        role: 'STUDENT',
        enrollments: { none: { courseGuid, active: true } },
        ...personSearch(typed),
      },
      select: {
        guid: true,
        firstName: true,
        lastName: true,
        email: true,
        enrollments: { where: { courseGuid, completedAt: { not: null } }, select: { id: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: VISIBLE_CANDIDATES,
    });

    return candidates.map(({ enrollments, ...candidate }) => ({ ...candidate, certified: enrollments.length > 0 }));
  }

  /**
   * Matricula a un alumno.
   *
   * Comprueba la sede del alumno, su rol y el cupo del curso antes de crear la matrícula.
   * A quien ya terminó su vuelta sólo se le abre otra con `confirmRestart`: empieza de cero
   * (ver `startNewRound`) y no puede ocurrir por una lista de candidatos desfasada.
   *
   * Todo ocurre con la fila del curso bloqueada: dos altas simultáneas en el mismo curso
   * esperan su turno y la segunda ya cuenta la primera al comprobar el cupo.
   */
  async enroll(courseGuid: string, studentGuid: string, user: JwtPayload, confirmRestart = false) {
    const course = await this.access.managedCourse(courseGuid, user);

    const student = await this.prisma.user.findFirst({
      where: { guid: studentGuid, country: user.country, role: 'STUDENT' },
      select: { guid: true, email: true, firstName: true },
    });
    if (!student) {
      throw new BadRequestException('El alumno debe ser un estudiante de tu misma sede.');
    }

    const { enrollment, retiredFiles } = await this.prisma.$transaction(async (tx) => {
      const maxStudents = await lockCourseCapacity(tx, courseGuid);

      const previous = await tx.enrollment.findUnique({
        where: { userGuid_courseGuid: { userGuid: studentGuid, courseGuid } },
        select: { id: true, active: true, completedAt: true },
      });
      if (previous?.active) {
        throw new ConflictException('Este alumno ya está matriculado en el curso.');
      }
      if (previous?.completedAt && !confirmRestart) {
        throw new ConflictException(
          'Este alumno ya terminó el curso. Si lo matriculas de nuevo empezará desde cero: confirma que quieres abrirle una vuelta nueva.',
        );
      }

      await this.checkCapacity(tx, courseGuid, maxStudents);

      if (!previous) {
        const created = await tx.enrollment.create({ data: { userGuid: studentGuid, courseGuid, type: 'MANUAL' } });
        return { enrollment: created, retiredFiles: [] };
      }
      if (previous.completedAt) return this.startNewRound(tx, previous.id, courseGuid, studentGuid);

      this.logger.log(`Matrícula reactivada de ${studentGuid} en ${courseGuid}: retoma donde lo dejó`);
      const resumed = await tx.enrollment.update({
        where: { id: previous.id },
        data: { active: true, unenrolledAt: null },
      });
      return { enrollment: resumed, retiredFiles: [] };
    });
    await this.submissionFiles.deleteRetired(retiredFiles);

    this.realtime.emitToUsers(
      'enrollment:changed',
      { action: 'enrolled', courseGuid, courseTitle: course.title },
      user.country,
      [studentGuid],
    );
    this.realtime.emitToCourseStaff(
      'enrollment:changed',
      { action: 'enrolled', courseGuid },
      user.country,
      course.teacherGuid,
    );

    this.welcome(course, student, user);

    return enrollment;
  }

  /**
   * Avisa al alumno de su matrícula en la campana y, si el curso está publicado, por correo.
   *
   * El correo dice que ya puede empezar, y en un curso sin publicar no es verdad: ahí sólo
   * queda el aviso, y el correo de que el curso está disponible sale al publicarlo.
   */
  private welcome(
    course: CourseAccessInfo,
    student: { guid: string; email: string; firstName: string },
    user: JwtPayload,
  ) {
    const published = course.status === 'PUBLISHED';

    void this.notifications
      .create({
        userGuid: student.guid,
        country: user.country,
        type: 'COURSE_WELCOME',
        title: 'Te matricularon en un curso',
        message: published
          ? `"${course.title}" ya está en tus cursos. Puedes empezar cuando quieras.`
          : `"${course.title}" todavía no está publicado. Podrás empezar en cuanto se publique; te avisaremos.`,
        actionUrl: `/courses/${course.guid}`,
        refType: NOTIFICATION_REF.course,
        refGuid: course.guid,
      })
      .catch((error) => this.logger.error('No se pudo crear el aviso de matrícula', error));

    if (!published) return;
    void this.mail
      .sendEnrollment(student.email, student.firstName, course.title, course.guid, user.country)
      .catch((error) => this.logger.error('No se pudo avisar de la matrícula', error));
  }

  /**
   * Da de baja a un alumno conservando su historial.
   *
   * No se borra la fila: sus fechas de alta, de baja y de fin de vuelta son el registro de la
   * capacitación, y el avance y las entregas siguen ahí por si retoma.
   *
   * Un intento de cuestionario que tuviera abierto se cierra como uno que se quedó sin
   * tiempo: cuenta como gastado y sin aciertos. Ya vio las preguntas, y un intento abierto
   * de quien ya no está en el curso impediría pasarlo a Borrador.
   */
  async unenroll(courseGuid: string, studentGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourse(courseGuid, user);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid: studentGuid, courseGuid } },
      select: { id: true, active: true },
    });
    if (!enrollment) throw new NotFoundException('Este alumno no está matriculado en el curso.');
    if (!enrollment.active) throw new BadRequestException('Esta matrícula ya está dada de baja.');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { active: false, unenrolledAt: now },
      }),
      this.prisma.submission.updateMany({
        where: { userGuid: studentGuid, status: 'DRAFT', assignment: { module: { courseGuid } } },
        data: { status: 'GRADED', submittedAt: now, score: MIN_SCORE, feedback: CLOSED_ATTEMPT_FEEDBACK },
      }),
    ]);

    this.realtime.emitToUsers('enrollment:changed', { action: 'unenrolled', courseGuid }, user.country, [studentGuid]);
    this.realtime.emitToCourseStaff(
      'enrollment:changed',
      { action: 'unenrolled', courseGuid },
      user.country,
      course.teacherGuid,
    );

    return { message: 'Matrícula dada de baja. El historial del alumno se conserva.' };
  }

  /**
   * Abre una vuelta nueva a quien ya terminó el curso.
   *
   * Necesita la capacitación otra vez —otra infracción, años después— y tiene que **volver
   * a hacerla**, no encontrársela aprobada. Empieza de cero: se retira su avance y sus
   * entregas pasan a `lms_entregas_archivadas`, con lo que los cuestionarios recuperan sus
   * intentos y la nota se calculará sólo con esta vuelta. Se archivan sin archivo —se borró al
   * emitirse el certificado— y con el nombre, la nota, el estado y el comentario.
   *
   * Quien no terminó retoma donde lo dejó (ver `enroll`): borrarle el trabajo sería
   * castigarle por una baja administrativa.
   *
   * El certificado anterior **no se toca**. Su código de verificación es público y puede
   * estar impreso en un documento ya entregado; anularlo haría desaparecer una formación
   * que sí ocurrió. Al terminar la nueva vuelta se emite otro y los dos conviven.
   */
  private async startNewRound(
    tx: Prisma.TransactionClient,
    enrollmentId: number,
    courseGuid: string,
    studentGuid: string,
  ) {
    // La vuelta ya certificada pudo conservar archivos si la puesta al día del arranque aún no la alcanzó.
    const retiredFiles = await this.submissionFiles.retireRound(tx, { userGuid: studentGuid, courseGuid });
    const submissions = await tx.submission.findMany({
      where: { userGuid: studentGuid, assignment: { module: { courseGuid } } },
      select: {
        guid: true,
        assignmentGuid: true,
        attachmentName: true,
        status: true,
        attemptNumber: true,
        submittedAt: true,
        score: true,
        feedback: true,
        assignment: { select: { title: true } },
      },
    });

    if (submissions.length > 0) {
      await tx.archivedSubmission.createMany({
        data: submissions.map(({ assignment, ...submission }) => ({
          ...submission,
          userGuid: studentGuid,
          courseGuid,
          assignmentTitle: assignment?.title ?? 'Tarea',
        })),
      });
      await tx.submission.deleteMany({ where: { guid: { in: submissions.map((submission) => submission.guid) } } });
    }

    const progress = await tx.resourceProgress.deleteMany({
      where: { userGuid: studentGuid, resource: { module: { courseGuid } } },
    });

    this.logger.log(
      `Nueva vuelta de ${studentGuid} en ${courseGuid}: ${progress.count} recursos completados retirados y ` +
        `${submissions.length} entregas archivadas`,
    );

    const enrollment = await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { active: true, unenrolledAt: null, enrolledAt: new Date(), completedAt: null, completedResources: 0 },
    });
    return { enrollment, retiredFiles };
  }

  /** Impide superar el cupo declarado del curso. */
  private async checkCapacity(tx: Prisma.TransactionClient, courseGuid: string, maxStudents: number | null) {
    if (!maxStudents) return;

    if ((await occupiedSeats(tx, courseGuid)) >= maxStudents) {
      throw new BadRequestException(
        `El curso ha alcanzado su cupo máximo de ${maxStudents} ${plural(maxStudents, 'estudiante', 'estudiantes')}. Amplíalo desde la ficha del curso para poder matricular a más.`,
      );
    }
  }
}
