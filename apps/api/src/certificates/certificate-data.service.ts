import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService } from '../courses/course-access.service';
import { averageOfScores } from '../common/domain/grading';
import { Country } from '../common/domain/country';
import { CertificateData } from './certificate-pdf';
import { computeValidUntil } from './validity';

/**
 * Horas que se acreditan cuando el curso no las declara.
 *
 * Un diploma dice cuántas horas dura el programa, no cuánto tardó esta persona en pasar
 * por él: son dos cosas distintas y sólo la primera se certifica. Mientras un curso no
 * declare su duración se acredita ésta, y queda avisado en el registro.
 */
const DEFAULT_HOURS = 1;

/** Todo lo que hace falta para emitir: el documento y a quién hay que avisar. */
export interface IssuanceData {
  /** Tiempo real del alumno dentro del curso. Se guarda, pero no es lo que se acredita. */
  activeSeconds: number;
  studentEmail: string;
  studentName: string;
  teacherEmail: string;
  teacherName: string;
  certificate: CertificateData;
}

/**
 * Reúne lo que se imprime en un certificado.
 *
 * `CertificatesService` decide **a quién y cuándo** se le emite —requisitos cumplidos,
 * vuelta actual, avisos—; éste arma **qué dice el documento**: los datos del alumno y del
 * curso, la marca de la sede, las imágenes y el código de verificación. Así el contenido
 * del diploma puede cambiar sin tocar las reglas de emisión.
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

    // Tras una certificación anterior empieza una vuelta nueva: sólo cuenta el tiempo de ésta.
    const previousCertificate = await this.prisma.certificate.findFirst({
      where: { userGuid, courseGuid },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });

    const [scores, studyTime] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userGuid, status: 'GRADED', score: { not: null }, assignment: { module: { courseGuid } } },
        select: { score: true },
      }),
      this.prisma.studySession.aggregate({
        where: {
          userGuid,
          courseGuid,
          ...(previousCertificate && { startedAt: { gt: previousCertificate.completedAt } }),
        },
        _sum: { durationSeconds: true },
      }),
    ]);

    const activeSeconds = studyTime._sum.durationSeconds ?? 0;
    const totalAssignments = resources.filter((resource) => resource.type === 'ASSIGNMENT').length;
    const creditedHours = this.creditedHoursFor(course.title, course.durationHours);
    const issuedAt = new Date();

    const [logo, signature] = await Promise.all([
      this.loadImage(config.logoUrl),
      config.certShowSignature ? this.loadImage(course.teacher.signatureUrl) : Promise.resolve(null),
    ]);

    return {
      activeSeconds,
      studentEmail: user.email,
      studentName: user.firstName,
      teacherEmail: course.teacher.email,
      teacherName: course.teacher.firstName,
      certificate: {
        studentName: `${user.firstName} ${user.lastName}`,
        courseTitle: course.title,
        startedAt: enrollment?.enrolledAt ?? issuedAt,
        completedAt: issuedAt,
        validUntil: computeValidUntil(issuedAt, config.certValidityMonths),
        totalHours: creditedHours,
        averageScore: averageOfScores(scores.map((submission) => submission.score)),
        verificationCode: this.generateCode(),
        teacherName: `${course.teacher.firstName} ${course.teacher.lastName}`,
        platformName: config.platformName,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        totalModules: course._count.modules,
        totalResources: resources.length,
        legalText:
          config.certLegalText || this.defaultLegalText(course._count.modules, resources.length, totalAssignments),
        customTitle: config.certCustomTitle,
        subtitle: config.certSubtitle,
        showModules: config.certShowModules,
        showResources: config.certShowResources,
        showScore: config.certShowScore,
        showSignature: config.certShowSignature,
        showEnrollmentDate: config.certShowEnrollmentDate,
        signatureName: course.teacher.signatureName,
        signatureTitle: course.teacher.signatureTitle,
        logo,
        signature,
      },
    };
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
      `El curso "${courseTitle}" no declara su duración: el certificado acredita ${DEFAULT_HOURS} hora(s). ` +
        'Configúrala en la ficha del curso.',
    );
    return DEFAULT_HOURS;
  }

  private defaultLegalText(modules: number, resources: number, assignments: number): string {
    return (
      'El presente certificado acredita que el participante cumplió satisfactoriamente la totalidad del programa ' +
      `de capacitación, compuesto por ${modules} módulo(s) y ${resources} recurso(s) formativo(s), incluyendo ` +
      `${assignments} evaluación(es) calificada(s) por el examinador asignado.`
    );
  }

  /**
   * Carga una imagen del almacenamiento para incrustarla en el PDF.
   * Devuelve `null` si no está: un certificado sin logotipo es preferible a no poder
   * emitirlo, pero el fallo se registra para que alguien lo corrija.
   */
  private async loadImage(key: string | null): Promise<Buffer | null> {
    if (!key) return null;
    try {
      const file = await this.storage.readFile(key);
      if (!file) {
        this.logger.warn(`Imagen del certificado no encontrada: ${key}`);
        return null;
      }
      return file.content;
    } catch (error) {
      this.logger.warn(`No se pudo cargar la imagen ${key} para el certificado`, error);
      return null;
    }
  }
}
