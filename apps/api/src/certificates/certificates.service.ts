import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseAccessService } from '../courses/course-access.service';
import { lockEnrollment } from '../enrollments/enrollment-lock';
import { percent } from '../common/domain/progress';
import { Country } from '../common/domain/country';
import { plural } from '../common/domain/text';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { composeCertificate } from './certificate-pdf';
import { CertificateDataService, IssuanceData } from './certificate-data.service';
import { isValid } from './validity';

/**
 * Tope de la transacción de emisión. Dentro se guarda el PDF, que con R2 es una subida por
 * red: el tope por defecto de Prisma (5 s) la cortaría a medias en una conexión lenta.
 */
const ISSUANCE_TIMEOUT_MS = 30_000;

/** Resultado de comprobar si un alumno ya puede recibir su certificado. */
export interface CompletionStatus {
  complete: boolean;
  canGetCertificate: boolean;
  completed: number;
  total: number;
  percent: number;
  pendingAssignments: { resourceGuid: string; title: string; status: string | null }[];
  reason: string | null;
}

/**
 * Certificados de finalización.
 *
 * Un certificado se emite cuando el alumno ha completado **todos** los recursos del curso
 * y **todas** sus tareas están calificadas. Es un documento con valor probatorio, así que
 * la emisión es idempotente (un certificado por alumno, curso y vuelta) y lleva un código
 * de verificación consultable públicamente.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly mail: MailService,
    /** Arma lo que dice el diploma; aquí sólo se decide a quién y cuándo se le emite. */
    private readonly data: CertificateDataService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Comprobación de finalización ─────────────────────────────────────────

  /**
   * Comprueba si un alumno cumple los requisitos del certificado y, si no, explica cuál
   * falta. El mensaje es el que ve el alumno, así que nombra las tareas pendientes en vez
   * de decir sólo que «no puede».
   */
  async checkCompletion(courseGuid: string, userGuid: string): Promise<CompletionStatus> {
    // La matrícula activa sólo existe dentro de una sede: comprobarla impide preguntar por
    // un curso ajeno, de la propia sede o de la otra.
    await this.access.ensureEnrollment(courseGuid, userGuid);

    const resources = await this.access.getCourseResources(courseGuid);

    if (resources.length === 0) {
      return {
        complete: false,
        canGetCertificate: false,
        completed: 0,
        total: 0,
        percent: 0,
        pendingAssignments: [],
        reason: 'Este curso todavía no tiene contenido.',
      };
    }

    const assignments = resources.filter((resource) => resource.type === 'ASSIGNMENT');
    const [completed, submissions] = await Promise.all([
      this.completedResources(
        userGuid,
        resources.map((resource) => resource.guid),
      ),
      this.submissionsOf(
        userGuid,
        assignments.map((assignment) => assignment.guid),
      ),
    ]);

    const pending = assignments
      .filter((assignment) => !submissions.graded.has(assignment.guid))
      .map((assignment) => ({
        resourceGuid: assignment.guid,
        title: assignment.title,
        status: submissions.statusOf.get(assignment.guid) ?? null,
      }));

    const complete = completed.size === resources.length;

    return {
      complete,
      canGetCertificate: complete && pending.length === 0,
      completed: completed.size,
      total: resources.length,
      percent: percent(completed.size, resources.length),
      pendingAssignments: pending,
      reason: this.getBlockedReason(complete, resources.length - completed.size, pending),
    };
  }

  /**
   * Cursos que el alumno ya terminó pero cuyo certificado espera a que le califiquen algo.
   * Se resuelve con un número fijo de consultas, sean tres cursos o treinta.
   */
  async coursesAwaitingGrading(userGuid: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userGuid, active: true },
      select: { courseGuid: true, course: { select: { title: true } } },
    });
    if (enrollments.length === 0) return [];

    const resources = await this.prisma.resource.findMany({
      where: { module: { courseGuid: { in: enrollments.map((enrollment) => enrollment.courseGuid) } } },
      select: { guid: true, title: true, type: true, module: { select: { courseGuid: true } } },
    });
    if (resources.length === 0) return [];

    const guids = resources.map((resource) => resource.guid);
    const [completed, submissions] = await Promise.all([
      this.completedResources(userGuid, guids),
      this.submissionsOf(userGuid, guids),
    ]);

    const byCourse = new Map<string, typeof resources>();
    for (const resource of resources) {
      const courseResources = byCourse.get(resource.module.courseGuid) ?? [];
      courseResources.push(resource);
      byCourse.set(resource.module.courseGuid, courseResources);
    }

    const awaiting: { courseGuid: string; courseTitle: string; pendingAssignments: { title: string }[] }[] = [];
    for (const enrollment of enrollments) {
      const courseResources = byCourse.get(enrollment.courseGuid) ?? [];
      if (courseResources.length === 0) continue;
      if (!courseResources.every((resource) => completed.has(resource.guid))) continue;

      const pending = courseResources
        .filter((resource) => resource.type === 'ASSIGNMENT' && !submissions.graded.has(resource.guid))
        .map((resource) => ({ title: resource.title }));

      if (pending.length > 0) {
        awaiting.push({
          courseGuid: enrollment.courseGuid,
          courseTitle: enrollment.course.title,
          pendingAssignments: pending,
        });
      }
    }

    return awaiting;
  }

  /** Recursos que el alumno tiene completados, de entre los indicados. */
  private async completedResources(userGuid: string, resourceGuids: string[]): Promise<Set<string>> {
    const progress = await this.prisma.resourceProgress.findMany({
      where: { userGuid, resourceGuid: { in: resourceGuids } },
      select: { resourceGuid: true },
    });
    return new Set(progress.map((row) => row.resourceGuid));
  }

  /**
   * Entregas del alumno en las tareas indicadas: cuáles están calificadas y el estado de
   * cada una. Un cuestionario puede tener varios intentos; basta con que uno esté calificado.
   */
  private async submissionsOf(userGuid: string, assignmentGuids: string[]) {
    const graded = new Set<string>();
    const statusOf = new Map<string, string>();
    if (assignmentGuids.length === 0) return { graded, statusOf };

    const submissions = await this.prisma.submission.findMany({
      where: { userGuid, assignmentGuid: { in: assignmentGuids } },
      select: { assignmentGuid: true, status: true },
    });
    for (const { assignmentGuid, status } of submissions) {
      if (!assignmentGuid) continue;
      statusOf.set(assignmentGuid, status);
      if (status === 'GRADED') graded.add(assignmentGuid);
    }
    return { graded, statusOf };
  }

  private getBlockedReason(complete: boolean, missing: number, pending: { title: string }[]): string | null {
    if (!complete) {
      return (
        `${plural(missing, 'Te falta', 'Te faltan')} ${missing} ${plural(missing, 'recurso', 'recursos')} ` +
        'por completar antes de poder obtener el certificado.'
      );
    }
    if (pending.length > 0) {
      const names = pending.map((assignment) => `"${assignment.title}"`).join(', ');
      return `Tu examinador todavía debe calificar ${pending.length} ${plural(pending.length, 'tarea', 'tareas')}: ${names}.`;
    }
    return null;
  }

  // ── Emisión ──────────────────────────────────────────────────────────────

  /**
   * Emite el certificado si el alumno cumple los requisitos, y no hace nada si no.
   * Lo invoca el listener de eventos cada vez que un progreso o una calificación pueden
   * haber cerrado el curso.
   */
  async issueIfEligible(courseGuid: string, userGuid: string, country: Country): Promise<void> {
    if (await this.currentRoundCertificate(courseGuid, userGuid)) return;

    const status = await this.checkCompletion(courseGuid, userGuid);
    if (!status.canGetCertificate) return;

    if (await this.issue(courseGuid, userGuid, country)) {
      this.logger.log(`Certificado emitido automáticamente: alumno ${userGuid}, curso ${courseGuid}`);
    }
  }

  /**
   * Certificado que corresponde a la matrícula vigente del alumno, si ya lo tiene.
   *
   * Un alumno puede repetir el mismo curso más adelante. La vuelta actual empieza en
   * `enrolledAt`, que se renueva al rematricular, así que un certificado anterior a esa
   * fecha pertenece a la vuelta pasada y no impide emitir el de ésta.
   */
  private async currentRoundCertificate(courseGuid: string, userGuid: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { enrolledAt: true },
    });

    return this.prisma.certificate.findFirst({
      where: {
        userGuid,
        courseGuid,
        ...(enrollment ? { completedAt: { gte: enrollment.enrolledAt } } : {}),
      },
      orderBy: { attempt: 'desc' },
      select: { id: true },
    });
  }

  /**
   * Compone el PDF, lo guarda y lo registra. Quien llama ya comprobó que procede.
   *
   * El último avance y la última calificación pueden llegar casi a la vez y lanzar dos
   * emisiones. Se ponen en fila sobre la matrícula: la segunda espera a que la primera
   * confirme, encuentra la vuelta cerrada y no hace nada. El PDF se compone antes, en
   * memoria, y sólo se guarda cuando ya es seguro que se registra, así que la emisión que
   * llega tarde no deja ningún archivo.
   *
   * @returns si se emitió.
   */
  private async issue(courseGuid: string, userGuid: string, country: Country): Promise<boolean> {
    const data = await this.data.gather(courseGuid, userGuid, country);
    const pdf = await composeCertificate(data.certificate);

    const certificate = await this.prisma.$transaction(
      async (tx) => {
        // Quien esperaba el bloqueo lee lo que dejó la emisión anterior: si ya cerró la
        // vuelta, no hay nada que emitir. Sin matrícula, tampoco.
        const enrollment = await lockEnrollment(tx, userGuid, courseGuid);
        if (!enrollment || enrollment.completedAt) return null;

        // Cuántas vueltas lleva el alumno por este curso. La primera es la 1.
        const attempt = (await tx.certificate.count({ where: { userGuid, courseGuid } })) + 1;

        const key = `certificados/${crypto.randomUUID()}.pdf`;
        await this.storage.saveWithKey(key, pdf, 'application/pdf');
        try {
          const created = await tx.certificate.create({
            data: {
              userGuid,
              holderName: data.certificate.studentName,
              country,
              courseGuid,
              courseTitle: data.certificate.courseTitle,
              attempt,
              verificationCode: data.certificate.verificationCode,
              pdfKey: key,
              startedAt: data.certificate.startedAt,
              completedAt: data.certificate.completedAt,
              validUntil: data.certificate.validUntil,
              totalHours: data.certificate.totalHours,
              activeSeconds: data.activeSeconds,
              averageScore: data.certificate.averageScore,
            },
            select: { guid: true },
          });
          // El certificado cierra la vuelta: la matrícula queda terminada en la misma
          // transacción, para que no haya certificado sin matrícula terminada ni al revés.
          await tx.enrollment.updateMany({
            where: { userGuid, courseGuid },
            data: { completedAt: data.certificate.completedAt },
          });
          return created;
        } catch (error) {
          // La transacción se deshace: ninguna fila llega a referenciar el PDF recién guardado.
          await this.storage.deleteFile(key).catch(() => undefined);
          throw error;
        }
      },
      { timeout: ISSUANCE_TIMEOUT_MS },
    );
    if (!certificate) return false;

    this.realtime.emitToUsers(
      'certificate:new',
      { guid: certificate.guid, courseGuid, courseTitle: data.certificate.courseTitle },
      country,
      [userGuid],
    );

    void this.notifyIssuance(certificate.guid, userGuid, data, country);
    return true;
  }

  /** Avisa al alumno, en la campana y por correo, y a su examinador. */
  private async notifyIssuance(
    certificateGuid: string,
    userGuid: string,
    data: IssuanceData,
    country: Country,
  ): Promise<void> {
    try {
      await Promise.all([
        this.notifications.create({
          userGuid,
          country,
          type: 'BADGE_UNLOCKED',
          title: 'Certificado disponible',
          message: `Terminaste "${data.certificate.courseTitle}". Tu certificado ya está listo para descargar.`,
          actionUrl: '/dashboard/student/certificates',
          refType: 'certificado',
          refGuid: certificateGuid,
        }),
        this.mail.sendCertificateIssued(
          data.studentEmail,
          data.studentName,
          data.certificate.courseTitle,
          data.certificate.verificationCode,
          country,
        ),
        this.mail.sendCourseCompleted(
          data.teacherEmail,
          data.teacherName,
          data.certificate.studentName,
          data.certificate.courseTitle,
          country,
        ),
      ]);
    } catch (error) {
      this.logger.error(`No se pudo avisar de la emisión del certificado ${certificateGuid}`, error);
    }
  }

  // ── Consulta ─────────────────────────────────────────────────────────────

  /** Certificados del alumno en sesión. */
  async getMyCertificates(user: JwtPayload) {
    const certificates = await this.prisma.certificate.findMany({
      where: { userGuid: user.sub },
      include: { course: { select: { coverImage: true } } },
      orderBy: { completedAt: 'desc' },
    });
    return certificates.map((certificate) => this.forStudent(certificate));
  }

  /**
   * Contenido del PDF. Sólo su titular o un administrador de la misma sede pueden
   * descargarlo: conocer el identificador no basta.
   */
  async getPdf(guid: string, user: JwtPayload): Promise<{ content: Buffer; fileName: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { guid },
      select: {
        userGuid: true,
        pdfKey: true,
        courseTitle: true,
        country: true,
      },
    });
    if (!certificate) throw new NotFoundException('Certificado no encontrado.');

    const isOwn = certificate.userGuid === user.sub;
    const isCountryAdmin = user.role === 'ADMIN' && certificate.country === user.country;
    if (!isOwn && !isCountryAdmin) {
      throw new ForbiddenException('No tienes permiso para consultar este certificado.');
    }

    const file = await this.storage.readFile(certificate.pdfKey);
    if (!file) {
      throw new NotFoundException(
        'El archivo del certificado no está disponible. Avisa al administrador para que lo vuelva a emitir.',
      );
    }

    const courseName = certificate.courseTitle.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Curso';
    return { content: file.content, fileName: `Certificado - ${courseName}.pdf` };
  }

  /**
   * Verificación pública por código.
   * Devuelve sólo lo imprescindible para comprobar la autenticidad de un documento: quién,
   * qué curso, cuándo y qué sede lo emitió. Ni correo, ni identificadores internos, ni
   * enlace al PDF.
   *
   * Un código de la otra sede también se verifica —quien lo consulta no tiene por qué saber
   * de cuál es—, pero la respuesta dice cuál lo emitió.
   */
  async verifyByCode(code: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { verificationCode: code.trim().toUpperCase() },
      select: {
        verificationCode: true,
        holderName: true,
        completedAt: true,
        validUntil: true,
        averageScore: true,
        totalHours: true,
        courseTitle: true,
        country: true,
      },
    });

    if (!certificate) {
      return { valid: false as const, message: 'No existe ningún certificado con ese código de verificación.' };
    }

    // `valid` responde a «este código corresponde a un certificado real», que es lo que se
    // comprueba al leer un diploma. Si además ha caducado se dice aparte, sin negar que la
    // capacitación ocurrió: quien repite el curso recibe uno nuevo y éste queda como
    // histórico.
    return {
      valid: true as const,
      certificate: {
        // El nombre con que se emitió: sigue ahí aunque el titular cambie su perfil o se
        // borre su cuenta.
        studentName: certificate.holderName,
        course: certificate.courseTitle,
        issuedAt: certificate.completedAt,
        validUntil: certificate.validUntil,
        unexpired: isValid(certificate.validUntil),
        hours: Number(certificate.totalHours),
        averageScore: certificate.averageScore === null ? null : Number(certificate.averageScore),
        verificationCode: certificate.verificationCode,
        issuer: await this.data.issuer(certificate.country),
      },
    };
  }

  private forStudent(certificate: {
    guid: string;
    holderName: string;
    courseGuid: string | null;
    courseTitle: string;
    attempt: number;
    verificationCode: string;
    startedAt: Date;
    completedAt: Date;
    validUntil: Date | null;
    totalHours: unknown;
    activeSeconds: number;
    averageScore: unknown;
    course: { coverImage: string | null } | null;
  }) {
    return {
      guid: certificate.guid,
      /** Nombre con que se emitió, el que figura en el diploma. */
      holderName: certificate.holderName,
      courseGuid: certificate.courseGuid,
      courseTitle: certificate.courseTitle,
      courseImage: certificate.course?.coverImage ?? null,
      /** Vuelta del alumno por el curso: 1 la primera vez, 2 si tuvo que repetirlo… */
      attempt: certificate.attempt,
      verificationCode: certificate.verificationCode,
      /** Cuándo se matriculó. Es la «fecha de inscripción» que aparece en el diploma. */
      startedAt: certificate.startedAt,
      completedAt: certificate.completedAt,
      validUntil: certificate.validUntil,
      unexpired: isValid(certificate.validUntil),
      /** Horas del programa, las que acredita el diploma. */
      hours: Number(certificate.totalHours),
      /** Lo que el alumno estuvo realmente dentro. No es lo que se acredita. */
      activeSeconds: certificate.activeSeconds,
      averageScore: certificate.averageScore === null ? null : Number(certificate.averageScore),
    };
  }
}
