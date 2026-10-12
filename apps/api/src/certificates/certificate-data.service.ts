import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService } from '../courses/course-access.service';
import { averageOfScores } from '../common/domain/grading';
import { Country } from '../common/domain/country';
import { plural } from '../common/domain/text';
import { canEmbedInPdf } from '../storage/file-formats';
import { CertificateContent, composeCertificate } from './certificate-pdf';
import { computeValidUntil } from './validity';

/**
 * Horas que se acreditan si el curso no declara su duración: el diploma acredita lo que dura
 * el programa, no lo que tardó el alumno. Queda avisado en el registro.
 */
const DEFAULT_HOURS = 1;

/**
 * Texto legal cuando la sede no escribe el suyo. De cuestionarios (los corrige la plataforma) y
 * tareas (las califica el examinador) sólo se puede afirmar que se superaron.
 */
export function defaultLegalText(modules: number, resources: number, assessments: number): string {
  const program =
    `${modules} ${plural(modules, 'módulo', 'módulos')} y ` +
    `${resources} ${plural(resources, 'recurso formativo', 'recursos formativos')}`;
  const assessed =
    assessments > 0
      ? `, incluyendo ${assessments} ${plural(assessments, 'evaluación superada', 'evaluaciones superadas')}`
      : '';

  return (
    'El presente certificado acredita que el participante cumplió satisfactoriamente la totalidad del programa ' +
    `de capacitación, compuesto por ${program}${assessed}.`
  );
}

/** Quién emitió un certificado, tal como lo muestra la verificación pública. */
export interface CertificateIssuer {
  country: Country;
  platformName: string;
}

/**
 * Lo que dice un certificado y de dónde salen sus imágenes. Se guarda con él para poder
 * recomponer el PDF si el archivo se pierde.
 */
export interface CertificateSnapshot extends CertificateContent {
  logoKey: string | null;
  signatureKey: string | null;
}

/** Lee la instantánea guardada con un certificado, con sus fechas. */
export function parseSnapshot(json: string): CertificateSnapshot {
  const stored = JSON.parse(json) as CertificateSnapshot;
  return {
    ...stored,
    startedAt: new Date(stored.startedAt),
    completedAt: new Date(stored.completedAt),
    validUntil: stored.validUntil ? new Date(stored.validUntil) : null,
  };
}

/** Todo lo que hace falta para emitir: el documento y a quién hay que avisar. */
export interface IssuanceData {
  /** Tiempo real del alumno dentro del curso. Se guarda, pero no es lo que se acredita. */
  activeSeconds: number;
  studentEmail: string;
  studentName: string;
  teacherGuid: string;
  teacherEmail: string;
  teacherName: string;
  certificate: CertificateSnapshot;
}

/**
 * Arma **qué dice** un certificado —datos del alumno y del curso, marca de la sede, imágenes y
 * código de verificación— y compone su PDF. A quién y cuándo se emite lo decide `CertificatesService`.
 */
@Injectable()
export class CertificateDataService {
  private readonly logger = new Logger(CertificateDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly access: CourseAccessService,
  ) {}

  /** Reúne del curso, el alumno y la configuración todo lo que se imprime en el PDF. */
  async gather(courseGuid: string, userGuid: string, country: Country): Promise<IssuanceData> {
    const [user, course, enrollment, config, resources] = await Promise.all([
      this.prisma.user.findUnique({
        where: { guid: userGuid },
        select: { firstName: true, lastName: true, email: true },
      }),
      this.prisma.course.findUnique({
        where: { guid: courseGuid },
        select: {
          title: true,
          durationHours: true,
          teacherGuid: true,
          teacher: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              signatureUrl: true,
              signatureName: true,
              signatureTitle: true,
            },
          },
          _count: { select: { modules: true } },
        },
      }),
      this.prisma.enrollment.findUnique({
        where: { userGuid_courseGuid: { userGuid, courseGuid } },
        select: { enrolledAt: true },
      }),
      this.settings.getSettings(country),
      this.access.getCourseResources(courseGuid),
    ]);
    if (!user || !course) throw new NotFoundException('No se encontró el alumno o el curso.');

    const issuedAt = new Date();
    const roundStart = enrollment?.enrolledAt ?? issuedAt;
    const { averageScore, activeSeconds } = await this.roundResults(courseGuid, userGuid, roundStart);
    const modules = course._count.modules;
    const assessments = resources.filter((resource) => resource.type === 'ASSIGNMENT').length;

    return {
      activeSeconds,
      studentEmail: user.email,
      studentName: user.firstName,
      teacherGuid: course.teacherGuid,
      teacherEmail: course.teacher.email,
      teacherName: course.teacher.firstName,
      certificate: {
        studentName: `${user.firstName} ${user.lastName}`.trim(),
        courseTitle: course.title,
        startedAt: roundStart,
        completedAt: issuedAt,
        validUntil: computeValidUntil(issuedAt, config.certValidityMonths),
        totalHours: this.creditedHoursFor(course.title, course.durationHours),
        averageScore,
        verificationCode: this.generateCode(),
        teacherName: `${course.teacher.firstName} ${course.teacher.lastName}`,
        platformName: config.platformName,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        totalModules: modules,
        totalResources: resources.length,
        legalText: config.certLegalText || defaultLegalText(modules, resources.length, assessments),
        customTitle: config.certCustomTitle,
        subtitle: config.certSubtitle,
        showModules: config.certShowModules,
        showResources: config.certShowResources,
        showScore: config.certShowScore,
        showSignature: config.certShowSignature,
        showEnrollmentDate: config.certShowEnrollmentDate,
        signatureName: course.teacher.signatureName,
        signatureTitle: course.teacher.signatureTitle,
        logoKey: config.logoUrl,
        signatureKey: course.teacher.signatureUrl,
      },
    };
  }

  /**
   * Nota media y tiempo de estudio de la vuelta actual. La nota es la mejor de cada evaluación:
   * los suspensos previos no la rebajan, y las de vueltas anteriores ya están archivadas.
   */
  private async roundResults(courseGuid: string, userGuid: string, roundStart: Date) {
    const [bestScores, studyTime] = await Promise.all([
      this.prisma.submission.groupBy({
        by: ['assignmentGuid'],
        where: { userGuid, status: 'GRADED', score: { not: null }, assignment: { module: { courseGuid } } },
        _max: { score: true },
      }),
      this.prisma.studySession.aggregate({
        where: { userGuid, courseGuid, startedAt: { gte: roundStart } },
        _sum: { durationSeconds: true },
      }),
    ]);

    return {
      averageScore: averageOfScores(bestScores.map((assessment) => assessment._max.score)),
      activeSeconds: studyTime._sum.durationSeconds ?? 0,
    };
  }

  /** Compone el PDF con las imágenes que aún estén en el almacenamiento; sin ellas también se emite. */
  async compose(snapshot: CertificateSnapshot): Promise<Buffer> {
    const [logo, signature] = await Promise.all([
      this.loadImage(snapshot.logoKey),
      snapshot.showSignature ? this.loadImage(snapshot.signatureKey) : null,
    ]);
    return composeCertificate({ ...snapshot, logo, signature });
  }

  /** La plataforma y la sede que emiten los certificados de `country`. */
  async issuer(country: Country): Promise<CertificateIssuer> {
    const { platformName } = await this.settings.getSettings(country);
    return { country, platformName };
  }

  /** Código legible, único y difícil de adivinar para la verificación pública. */
  private generateCode(): string {
    const random = crypto.randomBytes(5).toString('hex').toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `CERT-${random}-${timestamp}`;
  }

  /** Las horas del programa; si el curso no las declara, se avisa y se acredita el mínimo. */
  private creditedHoursFor(courseTitle: string, declared: number | null): number {
    if (declared) return declared;

    this.logger.warn(
      `El curso "${courseTitle}" no declara su duración: el certificado acredita ${DEFAULT_HOURS} ` +
        `${plural(DEFAULT_HOURS, 'hora', 'horas')}. Configúrala en la ficha del curso.`,
    );
    return DEFAULT_HOURS;
  }

  /** Mejor un certificado sin logotipo que no poder emitirlo, pero el fallo queda registrado para corregirlo. */
  private async loadImage(key: string | null): Promise<Buffer | null> {
    if (!key) return null;
    if (!canEmbedInPdf(key)) {
      this.logger.warn(
        `El certificado no puede incrustar ${key}: sólo admite PNG o JPG. Súbela de nuevo en uno de esos formatos.`,
      );
      return null;
    }

    const image = await this.storage.readFile(key);
    if (!image) this.logger.warn(`Imagen del certificado no encontrada: ${key}`);
    return image;
  }
}
