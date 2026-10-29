import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { RealtimeService } from '../realtime/realtime.service';
import { UserService } from '../auth/user.service';
import { EnrollmentsService, Student } from '../enrollments/enrollments.service';
import { CourseFullException } from '../enrollments/course-capacity';
import { Country } from '../common/domain/country';
import { WaitingReason } from './external-status';
import { refreshIntegrationPanels, ExternalRequest, REQUEST_FIELDS } from './external-request';
import { IntegrationCourses } from './integration-courses';
import { WaitingReminders } from './waiting-reminders';

/** Cómo terminó el intento de atender una solicitud. */
type Outcome = 'enrolled' | 'completed' | 'rejected' | 'waiting';

/**
 * Las matrículas pedidas por otros sistemas que esperan un curso, y su atención.
 *
 * La persona queda matriculada en cuanto la infracción por la que se pide tenga un curso publicado y
 * con plaza; si no tiene cuenta, se le crea con una contraseña temporal. Mientras no lo tenga, la
 * solicitud espera y los administradores reciben un aviso al día por infracción. Se vuelve a intentar
 * al recibirla, al elegir el curso de la infracción, al publicar un curso o cambiarle el cupo o el
 * título, y cada hora.
 *
 * Todo lo que saca una solicitud de la espera pasa por `serially`: la recepción, la publicación del
 * curso, la tarea horaria, el descarte de un administrador y la retirada del otro sistema no se
 * pisan entre sí. En cPanel corre una sola instancia del proceso, así que basta una cola en memoria
 * (como el candado de `MaintenanceService`); con varias, habría que llevarla a la base de datos.
 */
@Injectable()
export class WaitingRequestsService {
  private readonly logger = new Logger(WaitingRequestsService.name);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly enrollments: EnrollmentsService,
    private readonly courses: IntegrationCourses,
    private readonly reminders: WaitingReminders,
    private readonly realtime: RealtimeService,
  ) {}

  /** Atiende en el acto una solicitud recién llegada. Si falla, no se pierde: la retoma la tarea horaria. */
  async attendNew({ guid, externalId, country }: Pick<ExternalRequest, 'guid' | 'externalId' | 'country'>) {
    await this.serially(() => this.attend(guid)).catch((error) =>
      this.logger.error(`No se pudo atender en el acto la solicitud ${externalId}`, error),
    );
    refreshIntegrationPanels(this.realtime, country);
  }

  /**
   * Las que puede admitir un curso que se acaba de publicar o al que le cambió el cupo o el título:
   * las de sus infracciones y las de las infracciones de la sede sin curso, que quizá lo encuentren
   * ahora por su título.
   */
  async attendCourse(courseGuid: string, country: Country): Promise<void> {
    await this.attendWaiting({ country, infraction: { OR: [{ courseGuid }, { courseGuid: null }] } });
  }

  /** Las que esperaban por una infracción, en cuanto un administrador le elige curso. */
  async attendInfraction(infractionId: number): Promise<void> {
    await this.attendWaiting({ infractionId });
  }

  /**
   * Todas las que esperan. La tarea horaria cubre lo que ningún aviso dispara, como una plaza que
   * queda libre al certificarse alguien, y recuerda a los administradores lo que sigue faltando.
   *
   * @returns Cuántas personas quedaron matriculadas.
   */
  attendAll(): Promise<number> {
    return this.attendWaiting({});
  }

  /**
   * Saca de la espera, como rechazada por `reason`, una solicitud que sigue esperando.
   *
   * @returns Si esperaba.
   */
  async close({ guid, country }: { guid: string; country: Country }, reason: string): Promise<boolean> {
    const { count } = await this.serially(() =>
      this.prisma.externalEnrollment.updateMany({
        where: { guid, country, status: 'WAITING' },
        data: { status: 'REJECTED', rejectionReason: reason },
      }),
    );
    if (count > 0) refreshIntegrationPanels(this.realtime, country);
    return count > 0;
  }

  // ── Panel de administración ──────────────────────────────────────────────

  /** Retira de la espera una solicitud que no se va a atender; el otro sistema la verá rechazada. */
  async discard(guid: string, country: Country) {
    const discarded = await this.close({ guid, country }, 'Un administrador de la sede la descartó.');
    if (!discarded) throw new NotFoundException('No hay ninguna solicitud en espera con ese identificador.');
    return { message: 'Solicitud descartada. El sistema que la envió la verá como rechazada.' };
  }

  // ── Atención ─────────────────────────────────────────────────────────────

  /**
   * Recorre las que esperan por orden de llegada, así que las plazas libres se las llevan las que
   * llegaron antes. Cada una se mira por separado: aunque el curso esté lleno, puede pasar quien
   * ya lo está cursando o ya lo completó.
   */
  private async attendWaiting(where: Prisma.ExternalEnrollmentWhereInput): Promise<number> {
    const waiting = await this.prisma.externalEnrollment.findMany({
      where: { ...where, status: 'WAITING' },
      select: { guid: true, country: true },
      orderBy: { createdAt: 'asc' },
    });

    const changed = new Set<Country>();
    let enrolled = 0;
    for (const request of waiting) {
      try {
        const outcome = await this.serially(() => this.attend(request.guid));
        if (outcome === 'enrolled') enrolled++;
        if (outcome && outcome !== 'waiting') changed.add(request.country);
      } catch (error) {
        this.logger.error(`No se pudo atender la solicitud externa ${request.guid}`, error);
      }
    }

    changed.forEach((country) => refreshIntegrationPanels(this.realtime, country));
    return enrolled;
  }

  /**
   * Intenta matricular a quien pide la solicitud. Si ya terminó el curso después de pedirse, la da
   * por cumplida; si el curso aún no lo admite, la deja esperando y avisa a los administradores; y
   * si la persona no puede matricularse en la sede, la rechaza.
   */
  private async attend(guid: string): Promise<Outcome | null> {
    const request = await this.prisma.externalEnrollment.findUniqueOrThrow({ where: { guid }, select: REQUEST_FIELDS });
    if (request.status !== 'WAITING') return null;

    const course = await this.courses.courseFor({
      id: request.infractionId,
      country: request.country,
      ...request.infraction,
    });
    if (!course) return this.keepWaiting(request, 'COURSE_NOT_ASSIGNED');
    if (await this.completeIfEarned(request, course.guid)) return 'completed';

    const blocker = await this.courses.blockerFor(request.email, course);
    if (blocker) return this.keepWaiting(request, blocker);

    const student = await this.studentFor(request);
    if (!student) {
      await this.reject(request, 'El correo pertenece a una cuenta que no puede matricularse en esta sede.');
      return 'rejected';
    }

    try {
      const roundStartedAt = await this.enrollments.enrollFromIntegration(course, student);
      await this.prisma.externalEnrollment.update({
        where: { guid },
        data: { status: 'ENROLLED', userGuid: student.guid, courseGuid: course.guid, roundStartedAt },
      });
      this.logger.log(`Solicitud ${request.externalId}: ${request.email} matriculado en «${course.title}»`);
      return 'enrolled';
    } catch (error) {
      // Se llenó entre la comprobación y la matrícula: espera como cualquier otra.
      if (!(error instanceof CourseFullException)) throw error;
      return this.keepWaiting(request, 'COURSE_FULL');
    }
  }

  private async keepWaiting(request: ExternalRequest, reason: WaitingReason): Promise<'waiting'> {
    await this.reminders.remind(request, reason);
    return 'waiting';
  }

  /**
   * Da por cumplida la solicitud si la persona obtuvo el certificado del curso después de pedirse
   * —por ejemplo, porque la matricularon a mano mientras esperaba—: no tiene por qué repetirlo.
   */
  private async completeIfEarned(request: ExternalRequest, courseGuid: string): Promise<boolean> {
    const certificate = await this.prisma.certificate.findFirst({
      where: { courseGuid, user: { email: request.email }, completedAt: { gte: request.createdAt } },
      select: { guid: true, userGuid: true },
      orderBy: { completedAt: 'asc' },
    });
    if (!certificate) return false;

    await this.prisma.externalEnrollment.update({
      where: { guid: request.guid },
      data: { status: 'COMPLETED', userGuid: certificate.userGuid, courseGuid, certificateGuid: certificate.guid },
    });
    this.logger.log(`Solicitud ${request.externalId}: ${request.email} ya había completado el curso`);
    return true;
  }

  /** La cuenta de la persona en la sede, o una nueva con contraseña temporal; `null` si su correo es de otra. */
  private async studentFor(request: ExternalRequest, retried = false): Promise<Student | null> {
    const account = await this.prisma.user.findUnique({
      where: { email: request.email },
      select: { guid: true, email: true, firstName: true, role: true, country: true },
    });
    if (account) return account.role === 'STUDENT' && account.country === request.country ? account : null;

    try {
      const { user } = await this.users.createUser(
        { firstName: request.firstName, lastName: request.lastName, email: request.email, role: 'STUDENT' },
        request.country,
      );
      return user;
    } catch (error) {
      // Alguien creó la cuenta entre la consulta y el alta: se usa esa.
      if (!retried && (error instanceof ConflictException || isUniqueViolation(error))) {
        return this.studentFor(request, true);
      }
      throw error;
    }
  }

  private async reject(request: ExternalRequest, reason: string): Promise<void> {
    await this.prisma.externalEnrollment.update({
      where: { guid: request.guid },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    this.logger.warn(`Solicitud ${request.externalId} rechazada: ${reason}`);
  }

  /**
   * Ejecuta las tareas de una en una, en el orden en que llegan. Un fallo no detiene a las
   * siguientes: lo recibe sólo quien lanzó esa tarea.
   */
  private serially<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
