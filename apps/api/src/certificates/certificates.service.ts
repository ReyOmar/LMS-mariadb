import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseAccessService } from '../courses/course-access.service';
import { AFTER_LOCK, lockEnrollment } from '../enrollments/enrollment-lock';
import { percent } from '../common/domain/progress';
import { Country } from '../common/domain/country';
import { plural } from '../common/domain/text';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CertificateDataService, IssuanceData, parseSnapshot } from './certificate-data.service';
import { SubmissionFilesService } from './submission-files.service';
import { isValid } from './validity';

/**
 * Tope de la transacción de emisión: cubre la espera por la matrícula bloqueada y la escritura
 * del PDF en un disco compartido, que bajo carga puede pasar de los 5 s por defecto de Prisma.
 */
const ISSUANCE_TIMEOUT_MS = 10_000;

const FILES_RETIRED_NOTICE =
  'Los archivos que entregaste en este curso se retiraron del campus; tus calificaciones se conservan.';

/** Un certificado recién emitido: de quién, de qué curso y si se retiraron archivos entregados. */
interface IssuedCertificate {
  certificateGuid: string;
  courseGuid: string;
  userGuid: string;
  country: Country;
  data: IssuanceData;
  filesRetired: boolean;
}

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
 * de verificación consultable públicamente. Emitirlo cierra la vuelta y retira del disco los
 * archivos que el alumno entregó en ella; su PDF se conserva siempre.
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
    private readonly submissionFiles: SubmissionFilesService,
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
    if (await this.isRoundClosed(courseGuid, userGuid)) return;

    const status = await this.checkCompletion(courseGuid, userGuid);
    if (!status.canGetCertificate) return;

    if (await this.issue(courseGuid, userGuid, country)) {
      this.logger.log(`Certificado emitido automáticamente: alumno ${userGuid}, curso ${courseGuid}`);
    }
  }

  /** Si la vuelta actual ya terminó con su certificado: la misma condición que se comprueba al emitir. */
  private async isRoundClosed(courseGuid: string, userGuid: string): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { completedAt: true },
    });
    return Boolean(enrollment?.completedAt);
  }

  /**
   * Compone el PDF, lo guarda, lo registra y retira los archivos entregados en la vuelta. Quien
   * llama ya comprobó que procede.
   *
   * Dos emisiones casi simultáneas (el último avance y la última calificación) se ponen en fila
   * sobre la matrícula: la segunda encuentra la vuelta cerrada y no guarda ni retira nada.
   *
   * @returns si se emitió.
   */
  private async issue(courseGuid: string, userGuid: string, country: Country): Promise<boolean> {
    const data = await this.data.gather(courseGuid, userGuid, country);
    const pdf = await this.data.compose(data.certificate);
    const pdfKey = `certificados/${crypto.randomUUID()}.pdf`;

    let issued: { certificateGuid: string; retiredFiles: string[] } | null;
    try {
      issued = await this.prisma.$transaction(
        async (tx) => {
          const enrollment = await lockEnrollment(tx, userGuid, courseGuid);
          if (!enrollment || enrollment.completedAt) return null;

          await this.storage.saveWithKey(pdfKey, pdf);
          const certificate = await this.recordIssuance(tx, { courseGuid, userGuid, country, pdfKey, data });
          const retiredFiles = await this.submissionFiles.retireRound(tx, { userGuid, courseGuid });
          return { certificateGuid: certificate.guid, retiredFiles };
        },
        { ...AFTER_LOCK, timeout: ISSUANCE_TIMEOUT_MS },
      );
    } catch (error) {
      // También si falla al confirmar: ninguna fila llegó a usar el PDF.
      await this.storage.deleteFiles([pdfKey]);
      throw error;
    }
    if (!issued) return false;

    await this.submissionFiles.deleteRetired(issued.retiredFiles);
    this.announce({
      certificateGuid: issued.certificateGuid,
      courseGuid,
      userGuid,
      country,
      data,
      filesRetired: issued.retiredFiles.length > 0,
    });
    return true;
  }

  /** Avisa al momento a las pantallas abiertas del alumno y, si se retiraron archivos, a las del personal. */
  private announce(issued: IssuedCertificate): void {
    const { certificateGuid, courseGuid, userGuid, country, data } = issued;
    this.realtime.emitToUsers(
      'certificate:new',
      { guid: certificateGuid, courseGuid, courseTitle: data.certificate.courseTitle },
      country,
      [userGuid],
    );
    if (issued.filesRetired) {
      this.realtime.emitToCourseStaff('submission:files-retired', { courseGuid, userGuid }, country, data.teacherGuid);
    }

    void this.notify(issued);
  }

  /** Registra el certificado y cierra la vuelta en la misma transacción: no hay uno sin el otro. */
  private async recordIssuance(
    tx: Prisma.TransactionClient,
    issuance: { courseGuid: string; userGuid: string; country: Country; pdfKey: string; data: IssuanceData },
  ): Promise<{ guid: string }> {
    const { courseGuid, userGuid, country, pdfKey, data } = issuance;
    const attempt = (await tx.certificate.count({ where: { userGuid, courseGuid } })) + 1;

    const created = await tx.certificate.create({
      data: {
        userGuid,
        holderName: data.certificate.studentName,
        country,
        courseGuid,
        courseTitle: data.certificate.courseTitle,
        attempt,
        verificationCode: data.certificate.verificationCode,
        pdfKey,
        pdfData: JSON.stringify(data.certificate),
        startedAt: data.certificate.startedAt,
        completedAt: data.certificate.completedAt,
        validUntil: data.certificate.validUntil,
        totalHours: data.certificate.totalHours,
        activeSeconds: data.activeSeconds,
        averageScore: data.certificate.averageScore,
      },
      select: { guid: true },
    });
    await tx.enrollment.updateMany({
      where: { userGuid, courseGuid },
      data: { completedAt: data.certificate.completedAt },
    });
    return created;
  }

  /** Avisa al alumno, en la campana y por correo, y a su examinador. */
  private async notify({ certificateGuid, userGuid, country, data, filesRetired }: IssuedCertificate): Promise<void> {
    const ready = `Terminaste "${data.certificate.courseTitle}". Tu certificado ya está listo para descargar.`;
    try {
      await Promise.all([
        this.notifications.create({
          userGuid,
          country,
          type: 'BADGE_UNLOCKED',
          title: 'Certificado disponible',
          message: filesRetired ? `${ready} ${FILES_RETIRED_NOTICE}` : ready,
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
      select: { userGuid: true, pdfKey: true, pdfData: true, courseTitle: true, country: true },
    });
    if (!certificate) throw new NotFoundException('Certificado no encontrado.');

    const isOwn = certificate.userGuid === user.sub;
    const isCountryAdmin = user.role === 'ADMIN' && certificate.country === user.country;
    if (!isOwn && !isCountryAdmin) {
      throw new ForbiddenException('No tienes permiso para consultar este certificado.');
    }

    const content = (await this.storage.readFile(certificate.pdfKey)) ?? (await this.recomposePdf(guid, certificate));
    const courseName = certificate.courseTitle.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Curso';
    return { content, fileName: `Certificado - ${courseName}.pdf` };
  }

  /**
   * El PDF se conserva para descargarlo siempre; si el archivo se perdió (una copia de seguridad
   * restaurada a medias), se recompone con lo que se guardó al emitirlo y se vuelve a guardar.
   */
  private async recomposePdf(guid: string, certificate: { pdfKey: string; pdfData: string | null }): Promise<Buffer> {
    if (!certificate.pdfData) {
      this.logger.error(
        `Falta el PDF del certificado ${guid} (${certificate.pdfKey}) y no hay datos para recomponerlo`,
      );
      throw new NotFoundException(
        'El archivo de este certificado no está en el servidor. Avisa al administrador de la plataforma: tiene que restaurarlo desde la copia de seguridad de los archivos.',
      );
    }

    const pdf = await this.data.compose(parseSnapshot(certificate.pdfData));
    try {
      await this.storage.saveWithKey(certificate.pdfKey, pdf);
      this.logger.warn(`Recompuesto el PDF del certificado ${guid}, que faltaba en ${certificate.pdfKey}`);
    } catch (error) {
      this.logger.error(`Se recompuso el PDF del certificado ${guid}, pero no se pudo guardar`, error);
    }
    return pdf;
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
