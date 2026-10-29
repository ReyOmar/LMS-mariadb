import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessInfo } from '../courses/course-access.service';
import { occupiedSeats } from '../enrollments/course-capacity';
import { Country } from '../common/domain/country';
import { AssignedCourse, WaitingReason, waitingReasonFor } from './external-status';
import { matchCourse } from './course-match';

/** El curso que atiende una infracción, con lo que hace falta para matricular en él. */
export type InfractionCourse = CourseAccessInfo & AssignedCourse;

/** Una infracción, con lo que hace falta para buscarle curso. */
interface ServedInfraction {
  id: number;
  country: Country;
  code: string;
  description: string | null;
  courseGuid: string | null;
}

/** Los cursos que atienden infracciones, vistos desde quien espera entrar en ellos. */
@Injectable()
export class IntegrationCourses {
  private readonly logger = new Logger(IntegrationCourses.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * El curso que atiende la infracción: el que tiene o, si aún no tiene, el publicado de la sede que
   * señala su título (ver `matchCourse`), que queda elegido para las siguientes. `null` si no tiene
   * ni lo encuentra.
   */
  async courseFor(infraction: ServedInfraction): Promise<InfractionCourse | null> {
    if (infraction.courseGuid) return this.withSeats(infraction.courseGuid);

    const courses = await this.prisma.course.findMany({
      where: { country: infraction.country, status: 'PUBLISHED' },
      select: { guid: true, title: true },
    });
    const match = matchCourse(infraction, courses);
    if (!match) return null;

    // Sólo si sigue sin curso: si un administrador acaba de elegirle uno, manda el suyo.
    const { count } = await this.prisma.infraction.updateMany({
      where: { id: infraction.id, courseGuid: null },
      data: { courseGuid: match, autoAssigned: true },
    });
    if (count === 0) {
      const { courseGuid } = await this.prisma.infraction.findUniqueOrThrow({
        where: { id: infraction.id },
        select: { courseGuid: true },
      });
      return courseGuid ? this.withSeats(courseGuid) : null;
    }

    const course = await this.withSeats(match);
    this.logger.log(
      `Infracción ${infraction.code} (${infraction.country}): la atiende «${course?.title}», por su título`,
    );
    return course;
  }

  /** El curso, con sus plazas ocupadas si tiene cupo; `null` si se borró. */
  async withSeats(guid: string): Promise<InfractionCourse | null> {
    const course = await this.prisma.course.findUnique({
      where: { guid },
      select: {
        guid: true,
        country: true,
        title: true,
        status: true,
        teacherGuid: true,
        passingScore: true,
        maxStudents: true,
      },
    });
    if (!course) return null;
    const seats = course.maxStudents === null ? 0 : await occupiedSeats(this.prisma, course.guid);
    return { ...course, occupiedSeats: seats };
  }

  /**
   * Lo que impide todavía matricular a esa persona en el curso, o `null` si nada. Un curso lleno no
   * detiene a quien ya lo está cursando: sigue en él sin ocupar otra plaza.
   */
  async blockerFor(email: string, course: InfractionCourse): Promise<WaitingReason | null> {
    const reason = waitingReasonFor(course);
    if (reason !== 'COURSE_FULL') return reason;

    const studying = await this.prisma.enrollment.count({
      where: { courseGuid: course.guid, active: true, completedAt: null, user: { email } },
    });
    return studying > 0 ? null : reason;
  }

  /** Por qué espera quien pide el curso de esa infracción, o `null` si ya se le puede atender. */
  async waitingReason(courseGuid: string | null, email: string): Promise<WaitingReason | null> {
    const course = courseGuid ? await this.withSeats(courseGuid) : null;
    return course ? this.blockerFor(email, course) : 'COURSE_NOT_ASSIGNED';
  }
}
