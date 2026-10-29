import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { MailService } from '../mail/mail.service';
import { MAIL_CONCURRENCY } from '../mail/mail-transport';
import { RealtimeService } from '../realtime/realtime.service';
import { EventName } from '../realtime/events';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseAccessService, CourseAccessInfo } from './course-access.service';
import { ContentRemovalService } from './content-removal.service';
import { QuizOverview, parseQuizConfig, quizOverview } from './quiz-config';
import { isAttemptLive } from './quiz.service';
import { toClientResource } from './resource-view';
import { Country } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { emitEvent } from '../common/domain/domain-events';
import { percent } from '../common/domain/progress';
import { plural } from '../common/domain/text';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CourseStatus, CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';
import { lockCourseCapacity, occupiedSeats } from '../enrollments/course-capacity';
import { SYLLABUS_ORDER } from './syllabus-order';
import { NOTIFICATION_REF } from '../notifications/notification-ref';

/** Campos que bastan para pintar una tarjeta de curso en cualquier listado. */
const COURSE_SUMMARY = {
  guid: true,
  title: true,
  shortDescription: true,
  coverImage: true,
  level: true,
  status: true,
  durationHours: true,
  passingScore: true,
  teacherGuid: true,
  teacher: { select: { guid: true, firstName: true, lastName: true, role: true } },
  _count: { select: { modules: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect;

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
 * Lo que se puede cambiar de un curso publicado: su estado y su cupo. El resto de la ficha —la nota
 * mínima, el orden, las horas que acredita— rige lo que ya están haciendo sus alumnos, y como el
 * contenido sólo se cambia en Borrador.
 */
const LIVE_FIELDS: ReadonlySet<string> = new Set<keyof UpdateCourseDto>(['status', 'maxStudents']);

/** Si el DTO cambia algo de la ficha que sólo se edita en Borrador. */
function changesDraftOnlyFields(dto: UpdateCourseDto): boolean {
  return Object.entries(dto).some(([field, value]) => value !== undefined && !LIVE_FIELDS.has(field));
}

/** Lo que el DTO cambia de la ficha de un curso. */
function courseChanges(dto: UpdateCourseDto): Prisma.CourseUpdateInput {
  return {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.shortDescription !== undefined && { shortDescription: dto.shortDescription }),
    ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
    ...(dto.level !== undefined && { level: dto.level }),
    ...(dto.status !== undefined && { status: dto.status }),
    ...(dto.durationHours !== undefined && { durationHours: dto.durationHours }),
    ...(dto.passingScore !== undefined && { passingScore: dto.passingScore }),
    ...(dto.strictOrder !== undefined && { strictOrder: dto.strictOrder }),
    ...(dto.maxStudents !== undefined && { maxStudents: dto.maxStudents }),
  };
}

/**
 * Gestión de cursos: listados, ficha y ciclo de vida (borrador ↔ publicado).
 * El contenido (módulos y recursos) lo lleva `CourseContentService` y la evaluación
 * `QuizService`.
 */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly files: FileOwnershipService,
    private readonly removal: ContentRemovalService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Listados ─────────────────────────────────────────────────────────────

  /**
   * Cursos que ve el usuario según su rol. Siempre dentro de su sede.
   *  - Estudiante: aquellos en los que está matriculado.
   *  - Profesor: los que tiene asignados.
   *  - Administrador: todos los de la sede.
   */
  async getCurrentUserCourses(user: JwtPayload) {
    switch (user.role) {
      case 'STUDENT':
        return this.getStudentCourses(user.sub);
      case 'TEACHER':
        return this.getTeacherCourses(user.sub, user.country);
      case 'ADMIN':
        return this.prisma.course.findMany({
          where: { country: user.country },
          select: COURSE_SUMMARY,
          orderBy: { createdAt: 'desc' },
        });
    }
  }

  /**
   * Cursos del alumno con el avance de la vuelta actual, para pintar las tarjetas sin pedir
   * el progreso curso a curso. `completedAt` es nulo mientras la vuelta está en curso: un
   * certificado de una vuelta anterior no da el curso por terminado.
   */
  private async getStudentCourses(userGuid: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid, active: true },
      select: {
        enrolledAt: true,
        completedAt: true,
        completedResources: true,
        course: { select: { ...COURSE_SUMMARY, modules: { select: { _count: { select: { resources: true } } } } } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map(({ course: { modules, ...course }, enrolledAt, completedAt, completedResources }) => {
      const totalResources = modules.reduce((sum, module) => sum + module._count.resources, 0);
      // Hasta la reconciliación nocturna, retirar un recurso puede dejar el recuento por encima.
      const completed = Math.min(completedResources, totalResources);
      return {
        ...course,
        assignedAt: enrolledAt,
        completedAt,
        completedResources: completed,
        totalResources,
        percent: percent(completed, totalResources),
      };
    });
  }

  private getTeacherCourses(teacherGuid: string, country: Country) {
    return this.prisma.course.findMany({
      where: { teacherGuid, country },
      select: COURSE_SUMMARY,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cursos de un usuario concreto, para la ficha que ve un administrador.
   * El usuario consultado debe ser de la misma sede.
   */
  async getUserCourses(userGuid: string, country: Country) {
    const user = await this.prisma.user.findFirst({
      where: { guid: userGuid, country },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    return user.role === 'STUDENT' ? this.getStudentCourses(userGuid) : this.getTeacherCourses(userGuid, country);
  }

  // ── Ficha del curso ──────────────────────────────────────────────────────

  /**
   * Ficha completa para quien gestiona el curso, con la configuración de los
   * cuestionarios incluidas las respuestas correctas.
   */
  async getCourseForManagement(courseGuid: string, user: JwtPayload) {
    await this.access.managedCourse(courseGuid, user);
    const course = await this.loadCourseWithContent(courseGuid);

    return {
      ...course,
      modules: course.modules.map((module) => ({
        ...module,
        resources: module.resources.map((resource) => toClientResource(resource, this.storage)),
      })),
    };
  }

  /**
   * Ficha para un alumno matriculado. De cada cuestionario sólo sale su resumen (`quiz`):
   * las preguntas llegan al abrir el intento y las respuestas correctas nunca.
   */
  async getCourseForStudent(courseGuid: string, user: JwtPayload) {
    const course = await this.access.courseInCountry(courseGuid, user.country);
    await this.access.ensureEnrollment(courseGuid, user.sub);

    // Sin publicar sólo se entrega la cabecera: el alumno ve que está en mantenimiento
    // en lugar de un error, y el contenido no sale mientras se edita.
    if (course.status !== 'PUBLISHED') {
      return { guid: course.guid, title: course.title, status: course.status, modules: [] };
    }

    const fullCourse = await this.loadCourseWithContent(courseGuid);
    return {
      ...fullCourse,
      modules: fullCourse.modules.map((module) => ({
        ...module,
        resources: module.resources.map((resource) => ({
          ...toClientResource(resource, this.storage, () => null),
          quiz: this.quizOverviewForStudent(resource.quizConfig, resource.guid),
        })),
      })),
    };
  }

  /**
   * Resumen del cuestionario. Si la configuración está dañada devuelve `null` y lo registra,
   * en vez de romper la carga entera del curso por un recurso.
   */
  private quizOverviewForStudent(stored: string | null, resourceGuid: string): QuizOverview | null {
    if (!stored) return null;
    try {
      return quizOverview(parseQuizConfig(stored));
    } catch (error) {
      this.logger.error(`Cuestionario con configuración inválida en el recurso ${resourceGuid}`, error);
      return null;
    }
  }

  private async loadCourseWithContent(courseGuid: string) {
    const course = await this.prisma.course.findUnique({
      where: { guid: courseGuid },
      include: {
        teacher: { select: { guid: true, firstName: true, lastName: true } },
        modules: {
          orderBy: SYLLABUS_ORDER,
          include: { resources: { orderBy: SYLLABUS_ORDER } },
        },
      },
    });
    if (!course) throw new NotFoundException('Curso no encontrado.');
    return course;
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  /** Crea un curso en borrador, asignado a quien se indique o a quien lo crea. */
  async createCourse(dto: CreateCourseDto, user: JwtPayload) {
    const teacherGuid = dto.teacherGuid ?? user.sub;
    await this.ensureEligibleTeacher(teacherGuid, user.country);

    const course = await this.prisma.course.create({
      data: { title: dto.title, country: user.country, status: 'DRAFT', teacherGuid },
      select: COURSE_SUMMARY,
    });

    // Un borrador sólo le concierne a quien lo gestiona: los alumnos no saben de él hasta que se publica.
    this.realtime.emitToCourseStaff(
      'course:created',
      { guid: course.guid, title: course.title },
      user.country,
      teacherGuid,
    );
    return course;
  }

  /** Actualiza la ficha del curso con todo lo que admite el DTO. */
  async updateCourse(courseGuid: string, dto: UpdateCourseDto, user: JwtPayload) {
    const course = changesDraftOnlyFields(dto)
      ? await this.access.editableCourse(courseGuid, user)
      : await this.access.managedCourse(courseGuid, user);

    if (dto.passingScore !== undefined && dto.passingScore !== Number(course.passingScore)) {
      await this.ensureNothingGraded(courseGuid);
    }

    // Guardar el estado que ya tenía no es un cambio: no se valida ni se avisa a nadie.
    const newStatus = dto.status !== undefined && dto.status !== course.status ? dto.status : null;
    if (newStatus) await this.validateStatusChange(course, newStatus);
    const change = newStatus && (await this.statusChange(courseGuid, newStatus));

    const previous =
      dto.coverImage !== undefined
        ? await this.prisma.course.findUnique({ where: { guid: courseGuid }, select: { coverImage: true } })
        : null;
    const cover = { folder: 'portadas' as const, current: previous?.coverImage, next: dto.coverImage };

    const updated = await this.files.replace([cover], { uploader: user.sub }, () =>
      this.prisma.$transaction(async (tx) => {
        if (dto.maxStudents) await this.ensureSeatsFit(tx, courseGuid, dto.maxStudents);
        return tx.course.update({
          where: { guid: courseGuid },
          data: { ...courseChanges(dto), ...(change && { firstPublishedAt: change.firstPublishedAt }) },
          select: COURSE_SUMMARY,
        });
      }),
    );

    const students = await this.enrolledStudents(courseGuid);
    if (newStatus === 'DRAFT') {
      this.realtime.emitToUsers('course:maintenance', { courseGuid }, user.country, students);
    }
    this.emitToCourseAudience(
      'course:updated',
      { guid: courseGuid, status: updated.status },
      user.country,
      updated.teacherGuid,
      students,
    );

    if (change) await this.announceStatusChange(updated.guid, updated.title, change.kind, user.country);
    // Lo que puede dejar pasar a quien esperaba este curso desde otro sistema.
    const retitled = dto.title !== undefined && dto.title !== course.title;
    if (updated.status === 'PUBLISHED' && (newStatus || retitled || dto.maxStudents !== undefined)) {
      emitEvent(this.events, 'course.opened', { courseGuid, userGuid: user.sub, country: user.country });
    }
    return updated;
  }

  /**
   * Qué supone pasar al nuevo estado y la fecha de primera publicación que queda. Los cursos
   * publicados antes de que existiera esa fecha la reciben al cambiar de estado; mientras no la
   * tengan, el avance o las entregas de sus alumnos prueban que ya se habían publicado.
   */
  private async statusChange(courseGuid: string, newStatus: CourseStatus) {
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

  /**
   * La nota mínima ya decidió quién aprobó lo que está calificado, y con ello el avance de cada
   * alumno: cambiarla después dejaría notas que dicen una cosa y avances que dicen otra.
   */
  private async ensureNothingGraded(courseGuid: string): Promise<void> {
    const graded = await this.prisma.submission.findFirst({
      where: { status: 'GRADED', assignment: { module: { courseGuid } } },
      select: { guid: true },
    });
    if (graded) {
      throw new BadRequestException(
        'La nota mínima ya no puede cambiarse: hay tareas o cuestionarios calificados con la actual.',
      );
    }
  }

  /**
   * Un cupo por debajo de los ya matriculados no se cumpliría. Con la fila del curso bloqueada,
   * como al matricular: nadie ocupa una plaza entre el recuento y el cambio.
   */
  private async ensureSeatsFit(tx: Prisma.TransactionClient, courseGuid: string, maxStudents: number): Promise<void> {
    await lockCourseCapacity(tx, courseGuid);
    const occupied = await occupiedSeats(tx, courseGuid);
    if (occupied > maxStudents) {
      throw new BadRequestException(
        `El curso ya tiene ${occupied} ${plural(occupied, 'estudiante matriculado', 'estudiantes matriculados')}: el cupo no puede ser menor.`,
      );
    }
  }

  /**
   * Un curso publicado no vuelve a borrador mientras haya alguien haciendo un examen:
   * el intento quedaría huérfano y el alumno perdería su tiempo y su intento.
   */
  private async validateStatusChange(course: CourseAccessInfo, newStatus: CourseStatus): Promise<void> {
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
   * Avisa por correo y en la campana a quien tiene el curso en marcha cuando entra en
   * mantenimiento, cuando vuelve a publicarse y cuando se publica por primera vez (a quien se
   * matriculó en el borrador). Quien ya lo terminó no tiene nada que retomar.
   */
  private async announceStatusChange(
    courseGuid: string,
    title: string,
    change: StatusChange,
    country: Country,
  ): Promise<void> {
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

  /** Si algún alumno ha trabajado ya en el curso: avance y entregas sólo existen con el curso publicado. */
  private async hasStudentActivity(courseGuid: string): Promise<boolean> {
    const inCourse = { module: { courseGuid } };
    const [progress, submission] = await Promise.all([
      this.prisma.resourceProgress.findFirst({ where: { resource: inCourse }, select: { id: true } }),
      this.prisma.submission.findFirst({ where: { assignment: inCourse }, select: { guid: true } }),
    ]);
    return Boolean(progress ?? submission);
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

  /** Alumnos con matrícula activa, terminada o no: todos tienen el curso en su lista. */
  private async enrolledStudents(courseGuid: string): Promise<string[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseGuid, active: true },
      select: { userGuid: true },
    });
    return enrollments.map((enrollment) => enrollment.userGuid);
  }

  /**
   * Avisa de un cambio del curso a quien lo tiene delante: los administradores de la sede, su
   * responsable y los alumnos matriculados. Al resto de la sede no le concierne.
   */
  private emitToCourseAudience(
    event: EventName,
    data: unknown,
    country: Country,
    teacherGuid: string,
    studentGuids: string[],
  ): void {
    this.realtime.emitToCourseStaff(event, data, country, teacherGuid);
    this.realtime.emitToUsers(event, data, country, studentGuids);
  }

  /** Reasigna el responsable del curso. */
  async assignTeacher(courseGuid: string, teacherGuid: string, user: JwtPayload) {
    const course = await this.access.courseInCountry(courseGuid, user.country);
    await this.ensureEligibleTeacher(teacherGuid, user.country);

    const updated = await this.prisma.course.update({
      where: { guid: courseGuid },
      data: { teacherGuid },
      select: COURSE_SUMMARY,
    });

    const students = await this.enrolledStudents(courseGuid);
    this.emitToCourseAudience('course:updated', { guid: courseGuid }, user.country, teacherGuid, students);
    // Quien deja de ser el responsable tiene que ver cómo sale de su lista.
    if (course.teacherGuid !== teacherGuid) {
      this.realtime.emitToUsers('course:updated', { guid: courseGuid }, user.country, [course.teacherGuid]);
    }
    return updated;
  }

  /** El responsable de un curso tiene que ser un profesor o administrador de la sede. */
  private async ensureEligibleTeacher(teacherGuid: string, country: Country): Promise<void> {
    const teacher = await this.prisma.user.findFirst({
      where: { guid: teacherGuid, country, role: { in: ['ADMIN', 'TEACHER'] } },
      select: { guid: true },
    });
    if (!teacher) {
      throw new BadRequestException('El responsable del curso debe ser un profesor o administrador de tu sede.');
    }
  }

  /**
   * Elimina un curso en borrador con todo lo que cuelga de él: módulos, recursos,
   * matrículas, avance, entregas —también las archivadas de vueltas anteriores—, sesiones
   * de estudio y sus archivos.
   *
   * Los certificados **no**: acreditan una formación que ocurrió, llevan un código de
   * verificación público que puede estar impreso en un documento ya entregado, y no pueden
   * desaparecer porque después se retire el curso del catálogo. Se quedan sin curso
   * asociado, con el título con el que se emitieron.
   */
  async deleteCourse(courseGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourse(courseGuid, user);
    if (course.status !== 'DRAFT') {
      throw new BadRequestException('Sólo se pueden eliminar cursos en estado Borrador.');
    }

    const students = await this.enrolledStudents(courseGuid);
    await this.removal.remove({ courseGuid });
    this.emitToCourseAudience('course:deleted', { guid: courseGuid }, user.country, course.teacherGuid, students);

    return { message: 'Curso eliminado. Los certificados ya emitidos se conservan.' };
  }
}
