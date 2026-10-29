import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { Country } from '../common/domain/country';
import { waitingReasonFor } from './external-status';
import { IntegrationCourses } from './integration-courses';
import { WaitingRequestsService } from './waiting-requests.service';

/** Lo que el panel enseña de cada solicitud que espera. */
const WAITING_FIELDS = {
  guid: true,
  externalId: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  client: { select: { name: true } },
} satisfies Prisma.ExternalEnrollmentSelect;

/** Desde cuándo espera alguien por la infracción; las que no tienen a nadie esperando, al final. */
function waitingSince(infraction: { waiting: { createdAt: Date }[] }): number {
  return infraction.waiting[0]?.createdAt.getTime() ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Las infracciones de cada sede y el curso que atiende cada una.
 *
 * Se registran solas, con lo que envía el otro sistema, la primera vez que llega una solicitud por
 * ellas, y el campus les busca el curso por su título (ver `IntegrationCourses.courseFor`); si no lo
 * encuentra, o el que encontró no es el adecuado, lo elige un administrador. Así el otro sistema no
 * necesita saber nada de los cursos del campus.
 */
@Injectable()
export class InfractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: IntegrationCourses,
    private readonly waitingRequests: WaitingRequestsService,
  ) {}

  /**
   * La infracción de la sede con ese código, registrándola si es la primera vez que llega. Si viene
   * su descripción se guarda la última, que es lo que lee el administrador al elegir el curso.
   *
   * @returns Su identificador.
   */
  async register(country: Country, code: string, description: string | null): Promise<number> {
    const where = { country_code: { country, code } };
    const update = description ? { description } : {};
    try {
      const { id } = await this.prisma.infraction.upsert({
        where,
        create: { country, code, description },
        update,
        select: { id: true },
      });
      return id;
    } catch (error) {
      // Dos solicitudes a la vez por una infracción nueva: la segunda encuentra la de la primera.
      if (!isUniqueViolation(error)) throw error;
      const { id } = await this.prisma.infraction.update({ where, data: update, select: { id: true } });
      return id;
    }
  }

  /**
   * Las infracciones de la sede para el panel, con su curso y quién espera por ellas: primero las
   * que tienen a alguien esperando, desde la que espera hace más.
   */
  async list(country: Country) {
    const infractions = await this.prisma.infraction.findMany({
      where: { country },
      select: {
        id: true,
        code: true,
        description: true,
        course: { select: { guid: true, title: true, status: true } },
        autoAssigned: true,
        requests: { where: { status: 'WAITING' }, select: WAITING_FIELDS, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });

    const views = await Promise.all(
      infractions.map(async ({ requests, ...infraction }) => ({
        ...infraction,
        reason:
          requests.length > 0
            ? waitingReasonFor(infraction.course && (await this.courses.withSeats(infraction.course.guid)))
            : null,
        waiting: requests.map(({ client, ...request }) => ({ ...request, system: client.name })),
      })),
    );
    return views.sort((a, b) => waitingSince(a) - waitingSince(b));
  }

  /** Elige el curso que atiende la infracción y matricula en el acto a quienes esperaban por ella. */
  async assignCourse(id: number, courseGuid: string, country: Country) {
    const course = await this.prisma.course.findFirst({
      where: { guid: courseGuid, country },
      select: { title: true },
    });
    if (!course) throw new NotFoundException('Curso no encontrado.');

    const { count } = await this.prisma.infraction.updateMany({
      where: { id, country },
      data: { courseGuid, autoAssigned: false },
    });
    if (count === 0) throw new NotFoundException('No hay ninguna infracción con ese identificador.');

    await this.waitingRequests.attendInfraction(id);
    return { message: `Las solicitudes por esta infracción se matricularán en «${course.title}».` };
  }
}
