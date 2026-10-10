import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Country } from '../common/domain/country';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AWAITING_GRADE, isResourceUnlocked, waitedTooLong } from './progression';

/** Datos mínimos de un curso para decidir si alguien puede verlo o tocarlo. */
export interface CourseAccessInfo {
  guid: string;
  country: Country;
  title: string;
  status: CourseStatus;
  teacherGuid: string;
  passingScore: unknown;
}

/**
 * Reglas de acceso a un curso, en un solo sitio:
 *
 *  1. ¿El curso es de mi sede?
 *  2. ¿Lo gestiono yo?
 *  3. ¿Estoy matriculado en él?
 *  4. ¿A qué curso pertenece este módulo, recurso o entrega?
 *  5. ¿Le toca ya al alumno este recurso, si el curso exige orden?
 *
 * Un recurso de otra sede responde «no encontrado» y no «no autorizado»: para un usuario
 * de Colombia, los cursos de México no existen.
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Curso de la sede indicada. */
  async courseInCountry(courseGuid: string, country: Country): Promise<CourseAccessInfo> {
    const course = await this.prisma.course.findFirst({
      where: { guid: courseGuid, country },
      select: { guid: true, country: true, title: true, status: true, teacherGuid: true, passingScore: true },
    });
    if (!course) throw new NotFoundException('Curso no encontrado.');
    return course;
  }

  /**
   * Curso que el usuario puede administrar.
   * Un administrador gestiona todos los de su sede; un profesor sólo los asignados a él.
   */
  async managedCourse(courseGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    return this.checkManages(await this.courseInCountry(courseGuid, user.country), user);
  }

  /** Curso que el usuario puede administrar **y** que admite cambios de contenido. */
  async editableCourse(courseGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    return this.checkEditable(await this.managedCourse(courseGuid, user));
  }

  /** Curso al que pertenece un módulo. */
  async courseOfModule(moduleGuid: string, country: Country): Promise<CourseAccessInfo> {
    const module = await this.prisma.courseModule.findUnique({
      where: { guid: moduleGuid },
      select: { courseGuid: true },
    });
    if (!module) throw new NotFoundException('Módulo no encontrado.');
    return this.courseInCountry(module.courseGuid, country);
  }

  /** Curso al que pertenece un recurso. */
  async courseOfResource(resourceGuid: string, country: Country): Promise<CourseAccessInfo> {
    const resource = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { module: { select: { courseGuid: true } } },
    });
    if (!resource) throw new NotFoundException('Recurso no encontrado.');
    return this.courseInCountry(resource.module.courseGuid, country);
  }

  /** Curso de un módulo, si el usuario lo gestiona y admite cambios de contenido. */
  async editableCourseOfModule(moduleGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    return this.checkEditable(this.checkManages(await this.courseOfModule(moduleGuid, user.country), user));
  }

  /** Curso de un recurso, si el usuario lo gestiona. */
  async managedCourseOfResource(resourceGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    return this.checkManages(await this.courseOfResource(resourceGuid, user.country), user);
  }

  /** Curso de un recurso, si el usuario lo gestiona y admite cambios de contenido. */
  async editableCourseOfResource(resourceGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    return this.checkEditable(await this.managedCourseOfResource(resourceGuid, user));
  }

  /**
   * Comprueba que el usuario está matriculado en el curso.
   * @throws ForbiddenException con un mensaje que el alumno entiende, en lugar de un 404
   *         que le haría pensar que el curso no existe.
   */
  async ensureEnrollment(courseGuid: string, userGuid: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { active: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('No estás matriculado en este curso.');
    }
    if (!enrollment.active) {
      throw new ForbiddenException('Tu matrícula en este curso está dada de baja. Contacta con el administrador.');
    }
  }

  /**
   * Acceso al contenido de un recurso. Un alumno necesita que el curso sea de su sede, esté
   * publicado y lo tenga matriculado; un profesor, que el curso sea suyo.
   */
  async ensureResourceAccess(resourceGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    const course = await this.courseOfResource(resourceGuid, user.country);
    if (user.role !== 'STUDENT') return this.checkManages(course, user);

    await this.ensureEnrollment(course.guid, user.sub);
    if (course.status !== 'PUBLISHED') {
      throw new ForbiddenException('Este curso está en mantenimiento. Podrás continuar cuando vuelva a publicarse.');
    }
    return course;
  }

  /**
   * Acceso para hacer el trabajo del alumno sobre un recurso: presentar un cuestionario,
   * entregar una tarea o darlo por leído. El personal consulta el contenido, pero no lo
   * presenta: su intento o su entrega no serían de nadie matriculado.
   */
  async studentResourceAccess(resourceGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Sólo los estudiantes matriculados pueden realizar las actividades del curso.');
    }
    return this.ensureResourceAccess(resourceGuid, user);
  }

  /**
   * Como `studentResourceAccess` y, si el curso tiene orden estricto, con el recurso ya
   * desbloqueado: los anteriores completados según la regla del visor (`progression.ts`).
   */
  async unlockedResourceAccess(resourceGuid: string, user: JwtPayload): Promise<CourseAccessInfo> {
    const course = await this.studentResourceAccess(resourceGuid, user);
    await this.ensureUnlocked(course.guid, resourceGuid, user.sub);
    return course;
  }

  private async ensureUnlocked(courseGuid: string, resourceGuid: string, userGuid: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { guid: courseGuid },
      select: {
        strictOrder: true,
        modules: {
          orderBy: { position: 'asc' },
          select: { resources: { orderBy: { position: 'asc' }, select: { guid: true } } },
        },
      },
    });
    if (!course?.strictOrder) return;

    const guids = course.modules.flatMap((module) => module.resources.map((resource) => resource.guid));
    const [progress, pending] = await Promise.all([
      this.prisma.resourceProgress.findMany({
        where: { userGuid, resourceGuid: { in: guids } },
        select: { resourceGuid: true },
      }),
      this.prisma.submission.findMany({
        where: { userGuid, assignmentGuid: { in: guids }, status: { in: AWAITING_GRADE } },
        select: { assignmentGuid: true, submittedAt: true },
      }),
    ]);

    const completed = new Set([
      ...progress.map((row) => row.resourceGuid),
      ...pending.flatMap((row) => (row.assignmentGuid && waitedTooLong(row.submittedAt) ? [row.assignmentGuid] : [])),
    ]);
    if (!isResourceUnlocked(course.modules, resourceGuid, completed)) {
      throw new BadRequestException('Este recurso aún está bloqueado: completa primero los anteriores del curso.');
    }
  }

  /**
   * Curso al que pertenece una entrega, comprobando que quien la va a calificar es su
   * responsable: conocer el identificador de la entrega no basta.
   */
  async managedCourseOfSubmission(submissionGuid: string, user: JwtPayload) {
    const submission = await this.prisma.submission.findUnique({
      where: { guid: submissionGuid },
      select: {
        guid: true,
        userGuid: true,
        assignmentGuid: true,
        status: true,
        score: true,
        assignment: { select: { title: true, module: { select: { courseGuid: true } } } },
      },
    });
    if (!submission?.assignment) throw new NotFoundException('Entrega no encontrada.');

    const course = await this.managedCourse(submission.assignment.module.courseGuid, user);
    return { submission, course };
  }

  /** Recursos de un curso, en orden de recorrido. */
  async getCourseResources(courseGuid: string): Promise<{ guid: string; type: string; title: string }[]> {
    return this.prisma.resource.findMany({
      where: { module: { courseGuid } },
      select: { guid: true, type: true, title: true },
      orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
    });
  }

  private checkManages(course: CourseAccessInfo, user: JwtPayload): CourseAccessInfo {
    if (user.role === 'TEACHER' && course.teacherGuid !== user.sub) {
      throw new ForbiddenException('Sólo puedes trabajar sobre los cursos asignados a ti.');
    }
    return course;
  }

  /**
   * Un curso publicado no se edita: hay alumnos avanzando por él y cambiar los recursos
   * bajo sus pies invalidaría su progreso.
   */
  private checkEditable(course: CourseAccessInfo): CourseAccessInfo {
    if (course.status !== 'DRAFT') {
      throw new BadRequestException(
        'El curso debe estar en Borrador para modificar su contenido. Pásalo a Borrador desde la ficha del curso.',
      );
    }
    return course;
  }
}
