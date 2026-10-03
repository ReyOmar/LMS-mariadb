import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MAIL_CONCURRENCY, MailService } from '../mail/mail.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CourseAccessService, CourseAccessInfo } from './course-access.service';
import { parseQuizConfig, withoutAnswers } from './quiz-config';
import { toClientResource } from './resource-view';
import { Country } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CourseStatus, CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';

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
  issuesCertificate: true,
  teacherGuid: true,
  teacher: { select: { guid: true, firstName: true, lastName: true, role: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSelect;

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

  private async getStudentCourses(userGuid: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid, active: true },
      select: { enrolledAt: true, course: { select: COURSE_SUMMARY } },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map(({ course, enrolledAt }) => ({ ...course, assignedAt: enrolledAt }));
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

  /** Ficha para un alumno matriculado: los cuestionarios salen sin las respuestas correctas. */
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
        resources: module.resources.map((resource) =>
          toClientResource(resource, this.storage, (stored) => this.quizConfigForStudent(stored, resource.guid)),
        ),
      })),
    };
  }

  /**
   * Serializa el cuestionario sin respuestas. Si la configuración está dañada devuelve
   * `null` y lo registra, en vez de romper la carga entera del curso por un recurso.
   */
  private quizConfigForStudent(stored: string | null, resourceGuid: string): string | null {
    if (!stored) return null;
    try {
      return JSON.stringify(withoutAnswers(parseQuizConfig(stored)));
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
          orderBy: { position: 'asc' },
          include: { resources: { orderBy: { position: 'asc' } } },
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

    this.realtime.emitToCountry('course:created', { guid: course.guid, title: course.title }, user.country);
    return course;
  }

  /** Actualiza la ficha del curso con todo lo que admite el DTO. */
  async updateCourse(courseGuid: string, dto: UpdateCourseDto, user: JwtPayload) {
    const course = await this.access.managedCourse(courseGuid, user);

    if (dto.status !== undefined && dto.status !== course.status) {
      await this.validateStatusChange(course, dto.status);
    }

    const previous =
      dto.coverImage !== undefined
        ? await this.prisma.course.findUnique({ where: { guid: courseGuid }, select: { coverImage: true } })
        : null;

    const updated = await this.prisma.course.update({
      where: { guid: courseGuid },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.shortDescription !== undefined && { shortDescription: dto.shortDescription }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.durationHours !== undefined && { durationHours: dto.durationHours }),
        ...(dto.passingScore !== undefined && { passingScore: dto.passingScore }),
        ...(dto.strictOrder !== undefined && { strictOrder: dto.strictOrder }),
        ...(dto.issuesCertificate !== undefined && { issuesCertificate: dto.issuesCertificate }),
        ...(dto.maxStudents !== undefined && { maxStudents: dto.maxStudents }),
        ...(dto.accessCode !== undefined && { accessCode: dto.accessCode || null }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
      },
      select: COURSE_SUMMARY,
    });

    // La portada sustituida no la referencia nadie más.
    if (previous?.coverImage && previous.coverImage !== updated.coverImage) {
      void this.storage.deleteFiles([previous.coverImage]);
    }
    if (updated.status !== course.status) {
      await this.announceStatusChange(updated.guid, updated.title, updated.status, user.country);
    }

    this.realtime.emitToCountry('course:updated', { guid: courseGuid, status: updated.status }, user.country);
    return updated;
  }

  /**
   * Un curso publicado no vuelve a borrador mientras haya alguien haciendo un examen:
   * el intento quedaría huérfano y el alumno perdería su tiempo y su intento.
   */
  private async validateStatusChange(course: CourseAccessInfo, newStatus: CourseStatus): Promise<void> {
    if (course.status !== 'PUBLISHED' || newStatus === 'PUBLISHED') return;

    const quizzesInProgress = await this.prisma.submission.count({
      where: { status: 'DRAFT', assignment: { module: { courseGuid: course.guid } } },
    });

    if (quizzesInProgress > 0) {
      throw new BadRequestException(
        `No se puede pasar a Borrador: ${quizzesInProgress} estudiante(s) están realizando un cuestionario ahora mismo. Espera a que terminen.`,
      );
    }
  }

  /** Avisa a los matriculados cuando el curso entra en mantenimiento o vuelve a publicarse. */
  private async announceStatusChange(
    courseGuid: string,
    title: string,
    status: CourseStatus,
    country: Country,
  ): Promise<void> {
    if (status === 'ARCHIVED') return;

    const enrolledStudents = await this.prisma.enrollment.findMany({
      where: { courseGuid, active: true },
      select: { user: { select: { guid: true, email: true, firstName: true } } },
    });
    if (enrolledStudents.length === 0) return;

    const underMaintenance = status === 'DRAFT';

    this.realtime.emitToUsers(
      underMaintenance ? 'course:maintenance' : 'course:updated',
      { courseGuid, guid: courseGuid, title, status },
      country,
      enrolledStudents.map(({ user }) => user.guid),
    );

    // Los correos no bloquean la respuesta: publicar un curso no puede depender del
    // servidor de correo. Salen de pocos en pocos: un curso puede tener miles de matriculados.
    void settleWithConcurrency(enrolledStudents, MAIL_CONCURRENCY, ({ user }) =>
      underMaintenance
        ? this.mail.sendCourseUnderMaintenance(user.email, user.firstName, title, country)
        : this.mail.sendCourseReactivated(user.email, user.firstName, title, country),
    ).then((results) => {
      const failed = countRejected(results);
      if (failed > 0) {
        this.logger.error(`Fallo al avisar a ${failed} matriculado(s) del cambio de estado de ${courseGuid}`);
      }
    });
  }

  /** Reasigna el responsable del curso. */
  async assignTeacher(courseGuid: string, teacherGuid: string, user: JwtPayload) {
    await this.access.courseInCountry(courseGuid, user.country);
    await this.ensureEligibleTeacher(teacherGuid, user.country);

    const updated = await this.prisma.course.update({
      where: { guid: courseGuid },
      data: { teacherGuid },
      select: COURSE_SUMMARY,
    });

    this.realtime.emitToCountry('course:updated', { guid: courseGuid }, user.country);
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
   * matrículas, avance, entregas, sesiones de estudio y sus archivos.
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

    const files = await this.courseFiles(courseGuid);
    await this.prisma.course.delete({ where: { guid: courseGuid } });

    void this.storage.deleteFiles(files);
    this.realtime.emitToCountry('course:deleted', { guid: courseGuid }, user.country);

    return { message: 'Curso eliminado. Los certificados ya emitidos se conservan.' };
  }

  /** Reúne las claves de almacenamiento que dejarán de usarse al borrar el curso. */
  private async courseFiles(courseGuid: string): Promise<(string | null)[]> {
    const [course, resources, submissions] = await Promise.all([
      this.prisma.course.findUnique({ where: { guid: courseGuid }, select: { coverImage: true } }),
      this.prisma.resource.findMany({
        where: { module: { courseGuid }, OR: [{ attachmentKey: { not: null } }, { fileUrl: { not: null } }] },
        select: { attachmentKey: true, fileUrl: true },
      }),
      this.prisma.submission.findMany({
        where: { assignment: { module: { courseGuid } }, attachmentKey: { not: null } },
        select: { attachmentKey: true },
      }),
    ]);

    return [
      course?.coverImage ?? null,
      ...resources.flatMap((resource) => [resource.attachmentKey, resource.fileUrl]),
      ...submissions.map((submission) => submission.attachmentKey),
    ];
  }
}
