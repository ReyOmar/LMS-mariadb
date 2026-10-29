import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { campusUrl } from '../common/http/campus-url';
import { COUNTRY_METADATA } from '../common/domain/country';
import { ExternalStatus } from '@prisma/client';
import { statusReport, WaitingReason } from './external-status';
import { ExternalRequest } from './external-request';
import { IntegrationCourses } from './integration-courses';

/** Una solicitud tal como la ve el otro sistema. Forma parte del contrato (`docs/INTEGRACION.md`). */
export interface ExternalEnrollmentView {
  id: string;
  externalId: string;
  status: ExternalStatus;
  waitingReason: WaitingReason | null;
  detail: string;
  /** Código ISO de la sede: `CO` o `MX`. */
  country: string;
  infraction: { code: string; description: string | null };
  person: { firstName: string; lastName: string; email: string };
  course: { title: string; url: string } | null;
  requestedAt: Date;
  enrolledAt: Date | null;
  certificate: { code: string; verificationUrl: string; issuedAt: Date; validUntil: Date | null } | null;
}

/** Lo que se contesta al otro sistema por cada solicitud, con los enlaces al campus. */
@Injectable()
export class IntegrationViews {
  private readonly campus: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: IntegrationCourses,
    config: ConfigService,
  ) {
    this.campus = campusUrl(config);
  }

  async request(request: ExternalRequest): Promise<ExternalEnrollmentView> {
    const [waitingReason, enrollmentActive] = await Promise.all([
      request.status === 'WAITING'
        ? this.courses.waitingReason(request.infraction.courseGuid, request.email)
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
      country: COUNTRY_METADATA[request.country].iso,
      infraction: { code: request.infraction.code, description: request.infraction.description },
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

  /** Si la matrícula en la que quedó la solicitud sigue en pie. */
  private async isEnrolled({ status, userGuid, courseGuid }: ExternalRequest): Promise<boolean> {
    if (status !== 'ENROLLED' || !userGuid || !courseGuid) return false;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { active: true },
    });
    return enrollment?.active ?? false;
  }
}
