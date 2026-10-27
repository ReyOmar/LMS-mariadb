import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_CONCURRENCY, MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UserService } from '../auth/user.service';
import { EnrollmentsService, Student } from '../enrollments/enrollments.service';
import { CourseFullException, occupiedSeats } from '../enrollments/course-capacity';
import { CourseAccessInfo } from '../courses/course-access.service';
import { Country } from '../common/domain/country';
import { countRejected, settleWithConcurrency } from '../common/domain/concurrency';
import { plural } from '../common/domain/text';
import { campusUrl } from '../common/http/campus-url';
import { ExternalEnrollmentDto } from './dto/external-enrollment.dto';
import type { IntegrationCaller } from './integration-auth';
import {
  CourseForCode,
  ExternalStatus,
  statusReport,
  WAITING_REASON_TEXT,
  WaitingReason,
  waitingReasonFor,
} from './external-status';

/** Cada cuánto se recuerda a los administradores un curso que sigue faltando. */
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Donde los administradores ven lo que espera. */
export const INTEGRATIONS_PAGE = '/dashboard/admin/integrations';

/** Lo que se lee de una solicitud para atenderla y para contestar por ella. */
const REQUEST_FIELDS = {
  guid: true,
  externalId: true,
  country: true,
  courseCode: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  rejectionReason: true,
  userGuid: true,
  courseGuid: true,
  roundStartedAt: true,
  createdAt: true,
  course: { select: { title: true } },
  certificate: { select: { verificationCode: true, completedAt: true, validUntil: true } },
} satisfies Prisma.ExternalEnrollmentSelect;

type ExternalRequest = Prisma.ExternalEnrollmentGetPayload<{ select: typeof REQUEST_FIELDS }>;

/** El curso que lleva un código, con lo que hace falta para matricular en él. */
type CodedCourse = CourseAccessInfo & CourseForCode;

/** Cómo terminó el intento de atender una solicitud. */
type Outcome = 'enrolled' | 'waiting' | 'rejected';

/** Lo que se responde al otro sistema por cada solicitud. Forma parte del contrato (`docs/INTEGRACION.md`). */
export interface ExternalEnrollmentView {
  id: string;
  externalId: string;
  status: ExternalStatus;
  waitingReason: WaitingReason | null;
  detail: string;
  courseCode: string;
  person: { firstName: string; lastName: string; email: string };
  course: { title: string; url: string } | null;
  requestedAt: Date;
  enrolledAt: Date | null;
  certificate: { code: string; verificationUrl: string; issuedAt: Date; validUntil: Date | null } | null;
}

/**
 * Matrículas que piden otros sistemas, como el del PESV: cuando bloquea a un conductor por una
 * infracción, pide que haga el curso que lo vuelve a habilitar.
 *
 * La persona queda matriculada en cuanto haya un curso publicado, con plaza, que lleve el código
 * pedido; si no tiene cuenta, se le crea con una contraseña temporal. Mientras no lo haya, la
 * solicitud espera y los administradores reciben un aviso al día por código. Se vuelve a intentar
 * al publicar el curso, al ponerle el código o ampliar su cupo, y cada hora.
 *
 * Todo lo que saca una solicitud de la espera pasa por `serially`: el envío del otro sistema, la
 * publicación del curso, la tarea horaria y el descarte de un administrador no se pisan entre sí.
 * En cPanel corre una sola instancia del proceso, así que basta una cola en memoria (como el
 * candado de `MaintenanceService`); con varias, habría que llevarla a la base de datos.
 */
@Injectable()
export class ExternalEnrollmentsService {
  private readonly logger = new Logger(ExternalEnrollmentsService.name);
  private readonly campus: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly enrollments: EnrollmentsService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.campus = campusUrl(config);
  }

  // ── Lo que pide el otro sistema ──────────────────────────────────────────

  /**
   * Recibe una solicitud y la atiende en el acto si el curso ya la admite.
   *
   * Es idempotente: repetirla con el mismo `externalId` —un reintento tras un corte— devuelve la
   * que ya existe en lugar de crear otra. Reutilizar el identificador para otra persona u otro
   * curso es un error del otro sistema y se rechaza.
   */
  async receive(
    dto: ExternalEnrollmentDto,
    caller: IntegrationCaller,
  ): Promise<{ created: boolean; view: ExternalEnrollmentView }> {
    const existing = await this.findOwn(caller, dto.externalId);
    if (existing) {
      ensureSameRequest(existing, dto);
      return { created: false, view: await this.describe(existing) };
    }

    await this.ensureEnrollable(dto.email, caller.country);

    let guid: string;
    try {
      ({ guid } = await this.prisma.externalEnrollment.create({
        data: {
          clientId: caller.id,
          country: caller.country,
          externalId: dto.externalId,
          courseCode: dto.courseCode,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        select: { guid: true },
      }));
    } catch (error) {
      // Dos envíos simultáneos de la misma solicitud: el segundo encuentra la del primero.
      if (isUniqueViolation(error)) return this.receive(dto, caller);
      throw error;
    }
    this.logger.log(`Solicitud ${dto.externalId} de «${caller.name}»: ${dto.email} → ${dto.courseCode}`);

    // Un fallo al atenderla no la pierde: queda en espera y la retoma la tarea horaria.
    await this.serially(() => this.attend(guid)).catch((error) =>
      this.logger.error(`No se pudo atender en el acto la solicitud ${dto.externalId}`, error),
    );
    this.announceChange(caller.country);
    return { created: true, view: await this.describe(await this.load(guid)) };
  }

  /** En qué punto está una solicitud del sistema que la consulta. */
  async status(externalId: string, caller: IntegrationCaller): Promise<ExternalEnrollmentView> {
    const request = await this.findOwn(caller, externalId);
    if (!request) throw new NotFoundException(`No hay ninguna solicitud con el identificador ${externalId}.`);
    return this.describe(request);
  }

  // ── Atención de las que esperan ──────────────────────────────────────────

  /** Atiende las que esperaban el curso: se llama al publicarlo, al ponerle código o al ampliar su cupo. */
  async attendCourse(courseGuid: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { guid: courseGuid },
      select: { country: true, integrationCode: true },
    });
    if (!course?.integrationCode) return;
    await this.attendWaiting({ country: course.country, courseCode: course.integrationCode });
  }

  /**
   * Todas las que esperan. La tarea horaria cubre lo que ningún aviso dispara, como una plaza que
   * queda libre al certificarse alguien, y recuerda a los administradores lo que sigue faltando.
   *
   * @returns Cuántas personas quedaron matriculadas.
   */
  attendAllWaiting(): Promise<number> {
    return this.attendWaiting({});
  }

  /**
   * Recorre las que esperan, por orden de llegada y agrupadas por curso: si una no puede pasar
   * porque el curso falta o está lleno, las siguientes del mismo código tampoco.
   */
  private async attendWaiting(where: Prisma.ExternalEnrollmentWhereInput): Promise<number> {
    const waiting = await this.prisma.externalEnrollment.findMany({
      where: { ...where, status: 'WAITING' },
      select: { guid: true, country: true, courseCode: true },
      orderBy: { createdAt: 'asc' },
    });

    const blocked = new Set<string>();
    const changed = new Set<Country>();
    let enrolled = 0;
    for (const request of waiting) {
      const course = `${request.country}:${request.courseCode}`;
      if (blocked.has(course)) continue;

      try {
        const outcome = await this.serially(() => this.attend(request.guid));
        if (outcome === 'waiting') blocked.add(course);
        if (outcome === 'enrolled') enrolled++;
        if (outcome === 'enrolled' || outcome === 'rejected') changed.add(request.country);
      } catch (error) {
        this.logger.error(`No se pudo atender la solicitud externa ${request.guid}`, error);
      }
    }

    changed.forEach((country) => this.announceChange(country));
    return enrolled;
  }

  /**
   * Intenta matricular a quien pide la solicitud. Si el curso aún no lo admite, la deja esperando
   * y avisa a los administradores; si la persona no puede matricularse en la sede, la rechaza.
   */
  private async attend(guid: string): Promise<Outcome | null> {
    const request = await this.load(guid);
    if (request.status !== 'WAITING') return null;

    const course = await this.courseForCode(request.country, request.courseCode);
    const reason = waitingReasonFor(course);
    if (!course || reason) {
      await this.remindAdmins(request, reason ?? 'COURSE_NOT_FOUND');
      return 'waiting';
    }

    const student = await this.studentFor(request);
    if (!student) {
      await this.reject(guid, 'El correo pertenece a una cuenta que no puede matricularse en esta sede.');
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
      await this.remindAdmins(request, 'COURSE_FULL');
      return 'waiting';
    }
  }

  /** La cuenta de la persona en la sede, o una nueva con contraseña temporal; `null` si su correo es de otra. */
  private async studentFor(request: ExternalRequest): Promise<Student | null> {
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
      if (error instanceof ConflictException) return this.studentFor(request);
      throw error;
    }
  }

  /**
   * Avisa a los administradores de la sede de que falta un curso, como mucho una vez al día por
   * código: si llegan cien solicitudes seguidas del mismo, reciben un aviso con el recuento y no
   * cien. Un aviso que no sale no impide nada: la solicitud sigue esperando.
   */
  private async remindAdmins(request: ExternalRequest, reason: WaitingReason): Promise<void> {
    const { country, courseCode } = request;
    const alreadyReminded = await this.prisma.externalEnrollment.count({
      where: {
        country,
        courseCode,
        status: 'WAITING',
        adminNotifiedAt: { gte: new Date(Date.now() - REMINDER_INTERVAL_MS) },
      },
    });
    if (alreadyReminded > 0) return;

    await this.prisma.externalEnrollment.update({
      where: { guid: request.guid },
      data: { adminNotifiedAt: new Date() },
    });
    const [waiting, admins] = await Promise.all([
      this.prisma.externalEnrollment.count({ where: { country, courseCode, status: 'WAITING' } }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN', country },
        select: { guid: true, email: true, firstName: true },
      }),
    ]);
    const people = `${waiting} ${plural(waiting, 'persona', 'personas')}`;
    const why = WAITING_REASON_TEXT[reason];

    const notices = await Promise.allSettled(
      admins.map((admin) =>
        this.notifications.create({
          userGuid: admin.guid,
          country,
          type: 'ENROLLMENT_WAITING',
          title: `Curso solicitado no disponible: ${courseCode}`,
          message: `${people} ${plural(waiting, 'espera', 'esperan')} matricularse con el código ${courseCode}, pero ${why}.`,
          actionUrl: INTEGRATIONS_PAGE,
        }),
      ),
    );
    const mails = await settleWithConcurrency(admins, MAIL_CONCURRENCY, (admin) =>
      this.mail.sendEnrollmentWaiting(admin.email, admin.firstName, { courseCode, people, reason: why }, country),
    );
    const failed = countRejected(notices) + countRejected(mails);
    if (failed > 0) this.logger.error(`No se pudo avisar de ${courseCode} en ${failed} caso(s) (${country})`);
  }

  private async reject(guid: string, reason: string): Promise<void> {
    await this.prisma.externalEnrollment.update({
      where: { guid },
      data: { status: 'REJECTED', rejectionReason: reason },
    });
    this.logger.warn(`Solicitud externa ${guid} rechazada: ${reason}`);
  }

  // ── Panel de administración ──────────────────────────────────────────────

  /** Las que esperan en la sede, por código de curso, con lo que falta para atenderlas. */
  async waitingByCourse(country: Country) {
    const waiting = await this.prisma.externalEnrollment.findMany({
      where: { country, status: 'WAITING' },
      select: {
        guid: true,
        externalId: true,
        courseCode: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byCode = new Map<string, typeof waiting>();
    for (const request of waiting) byCode.set(request.courseCode, [...(byCode.get(request.courseCode) ?? []), request]);

    return Promise.all(
      [...byCode].map(async ([courseCode, requests]) => {
        const course = await this.courseForCode(country, courseCode);
        return {
          courseCode,
          course: course && { guid: course.guid, title: course.title, status: course.status },
          reason: waitingReasonFor(course),
          requests: requests.map(({ client, ...request }) => ({ ...request, system: client.name })),
        };
      }),
    );
  }

  /** Retira de la espera una solicitud cuyo curso no se va a ofrecer; el otro sistema la verá rechazada. */
  async discard(guid: string, country: Country) {
    const { count } = await this.serially(() =>
      this.prisma.externalEnrollment.updateMany({
        where: { guid, country, status: 'WAITING' },
        data: {
          status: 'REJECTED',
          rejectionReason: 'Un administrador la descartó: el curso pedido no se va a ofrecer.',
        },
      }),
    );
    if (count === 0) throw new NotFoundException('No hay ninguna solicitud en espera con ese identificador.');
    this.announceChange(country);
    return { message: 'Solicitud descartada. El sistema que la envió la verá como rechazada.' };
  }

  // ── Piezas comunes ───────────────────────────────────────────────────────

  /**
   * Ejecuta las tareas de una en una, en el orden en que llegan. Un fallo no detiene a las
   * siguientes: lo recibe sólo quien lanzó esa tarea.
   */
  private serially<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private findOwn(caller: IntegrationCaller, externalId: string) {
    return this.prisma.externalEnrollment.findUnique({
      where: { clientId_externalId: { clientId: caller.id, externalId } },
      select: REQUEST_FIELDS,
    });
  }

  private load(guid: string): Promise<ExternalRequest> {
    return this.prisma.externalEnrollment.findUniqueOrThrow({ where: { guid }, select: REQUEST_FIELDS });
  }

  /** El curso de la sede que lleva el código, con sus plazas ocupadas si tiene cupo. */
  private async courseForCode(country: Country, courseCode: string): Promise<CodedCourse | null> {
    const course = await this.prisma.course.findUnique({
      where: { country_integrationCode: { country, integrationCode: courseCode } },
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

  /** Un correo que ya es de otra sede, de un examinador o de un administrador no puede matricularse aquí. */
  private async ensureEnrollable(email: string, country: Country): Promise<void> {
    const account = await this.prisma.user.findUnique({ where: { email }, select: { role: true, country: true } });
    if (account && (account.role !== 'STUDENT' || account.country !== country)) {
      throw new ConflictException('El correo pertenece a una cuenta que no puede matricularse en esta sede.');
    }
  }

  private async describe(request: ExternalRequest): Promise<ExternalEnrollmentView> {
    const [waitingReason, enrollmentActive] = await Promise.all([
      request.status === 'WAITING'
        ? this.courseForCode(request.country, request.courseCode).then(waitingReasonFor)
        : Promise.resolve(null),
      this.isEnrolled(request),
    ]);
    const report = statusReport(request, {
      waitingReason,
      enrollmentActive,
      courseTitle: request.course?.title ?? null,
      certificateCode: request.certificate?.verificationCode ?? null,
    });
    const { course, certificate } = request;

    return {
      id: request.guid,
      externalId: request.externalId,
      ...report,
      courseCode: request.courseCode,
      person: { firstName: request.firstName, lastName: request.lastName, email: request.email },
      course:
        course && request.courseGuid
          ? { title: course.title, url: `${this.campus}/courses/${request.courseGuid}` }
          : null,
      requestedAt: request.createdAt,
      enrolledAt: request.roundStartedAt,
      certificate: certificate && {
        code: certificate.verificationCode,
        verificationUrl: `${this.campus}/verify?code=${encodeURIComponent(certificate.verificationCode)}`,
        issuedAt: certificate.completedAt,
        validUntil: certificate.validUntil,
      },
    };
  }

  private async isEnrolled({ status, userGuid, courseGuid }: ExternalRequest): Promise<boolean> {
    if (status !== 'ENROLLED' || !userGuid || !courseGuid) return false;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { active: true },
    });
    return enrollment?.active ?? false;
  }

  /** Los paneles de integración de la sede abiertos se ponen al día. */
  private announceChange(country: Country): void {
    this.realtime.emitToRole('integration:changed', {}, country, 'ADMIN');
  }
}

/** Repetir un `externalId` sólo vale para la misma persona y el mismo curso. */
function ensureSameRequest(existing: ExternalRequest, dto: ExternalEnrollmentDto): void {
  if (existing.email !== dto.email || existing.courseCode !== dto.courseCode) {
    throw new ConflictException(
      `El identificador ${dto.externalId} ya se usó para otra solicitud (${existing.email}, ${existing.courseCode}). Cada solicitud necesita el suyo.`,
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
