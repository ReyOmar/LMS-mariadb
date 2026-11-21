import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EventName } from '../realtime/events';
import { CourseAccessService, type CourseAccessInfo } from './course-access.service';
import { CourseStatusChanges } from './course-status-changes';
import { ContentRemovalService } from './content-removal.service';
import { QuizOverview, parseQuizConfig, quizOverview } from './quiz-config';
import { toClientResource, toLockedResource } from './resource-view';
import { definedFields } from '../common/domain/defined-fields';
import { Country } from '../common/domain/country';
import { emitEvent } from '../common/domain/domain-events';
import { percent } from '../common/domain/progress';
import { plural } from '../common/domain/text';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';
import { lockCourseCapacity, occupiedSeats } from '../enrollments/course-capacity';
import { SYLLABUS_ORDER } from './syllabus-order';

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

/** Los campos de la ficha de un curso que una edición puede cambiar. */
const COURSE_FIELDS = [
  'title',
  'description',
  'shortDescription',
  'coverImage',
  'level',
  'status',
  'durationHours',
  'passingScore',
  'strictOrder',
  'maxStudents',
] as const satisfies readonly (keyof UpdateCourseDto)[];

/**
 * Gestión de cursos: listados, ficha y ciclo de vida (borrador ↔ publicado), cuyas reglas y
 * avisos lleva `CourseStatusChanges`. El contenido (módulos y recursos) lo lleva
 * `CourseContentService` y la evaluación `QuizService`.
 */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly files: FileOwnershipService,
    private readonly removal: ContentRemovalService,
    private readonly events: EventEmitter2,
    private readonly statusChanges: CourseStatusChanges,
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

    const [fullCourse, unlocked] = await Promise.all([
      this.loadCourseWithContent(courseGuid),
      this.access.unlockedResources(courseGuid, user.sub),
    ]);
    // Con orden estricto, lo que aún no le toca viaja sin contenido: saltarse el temario no puede
    // depender de que el navegador no lo enseñe.
    const isLocked = (resource: { guid: string }) => unlocked !== null && !unlocked.has(resource.guid);
    return {
      ...fullCourse,
      modules: fullCourse.modules.map((module) => ({
        ...module,
        resources: module.resources.map((resource) =>
          isLocked(resource)
            ? toLockedResource(resource)
            : {
                ...toClientResource(resource, this.storage, () => null),
                quiz: this.quizOverviewForStudent(resource.quizConfig, resource.guid),
              },
        ),
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

    const { newStatus, change } = await this.statusTransition(course, dto.status);
    const cover = await this.coverChange(courseGuid, dto);
    const updated = await this.files.replace([cover], { uploader: user.sub }, () =>
      this.prisma.$transaction(async (tx) => {
        if (dto.maxStudents) await this.ensureSeatsFit(tx, courseGuid, dto.maxStudents);
        return tx.course.update({
          where: { guid: courseGuid },
          data: { ...definedFields(dto, COURSE_FIELDS), ...(change && { firstPublishedAt: change.firstPublishedAt }) },
          select: COURSE_SUMMARY,
        });
      }),
    );

    await this.announceUpdate(updated, user, newStatus);
    if (change) await this.statusChanges.announce(updated.guid, updated.title, change.kind, user.country);
    // Lo que puede dejar pasar a quien esperaba este curso desde otro sistema.
    const retitled = dto.title !== undefined && dto.title !== course.title;
    if (updated.status === 'PUBLISHED' && (newStatus || retitled || dto.maxStudents !== undefined)) {
      emitEvent(this.events, 'course.opened', { courseGuid, userGuid: user.sub, country: user.country });
    }
    return updated;
  }

  /**
   * El cambio de estado que pide una edición, ya permitido y clasificado. Guardar el estado que
   * ya tenía no es un cambio: no se valida ni se avisa a nadie.
   */
  private async statusTransition(course: CourseAccessInfo, requested: UpdateCourseDto['status']) {
    if (requested === undefined || requested === course.status) return { newStatus: null, change: null };

    await this.statusChanges.ensureAllowed(course, requested);
    return { newStatus: requested, change: await this.statusChanges.classify(course.guid, requested) };
  }

  /** La portada que deja de usarse y la que entra: la sustituida se retira del almacenamiento. */
  private async coverChange(courseGuid: string, dto: UpdateCourseDto) {
    const previous =
      dto.coverImage !== undefined
        ? await this.prisma.course.findUnique({ where: { guid: courseGuid }, select: { coverImage: true } })
        : null;
    return { folder: 'portadas' as const, current: previous?.coverImage, next: dto.coverImage };
  }

  /** Avisa del cambio a quien tiene el curso abierto; si pasó a Borrador, a sus alumnos se les cierra. */
  private async announceUpdate(
    updated: { guid: string; status: CourseStatus; teacherGuid: string },
    user: JwtPayload,
    newStatus: CourseStatus | null,
  ): Promise<void> {
    const students = await this.enrolledStudents(updated.guid);
    if (newStatus === 'DRAFT') {
      this.realtime.emitToUsers('course:maintenance', { courseGuid: updated.guid }, user.country, students);
    }
    this.emitToCourseAudience(
      'course:updated',
      { guid: updated.guid, status: updated.status },
      user.country,
      updated.teacherGuid,
      students,
    );
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
      throw new BadRequestException('El responsable del curso debe ser un examinador o administrador de tu sede.');
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
