import { CourseStatus, ExternalEnrollmentStatus, ExternalStatus } from '@prisma/client';

/** Por qué espera: lo que tiene que hacer un administrador para que se atienda. */
export const WAITING_REASONS = ['COURSE_NOT_ASSIGNED', 'COURSE_NOT_PUBLISHED', 'COURSE_FULL'] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];

/** El curso que atiende la infracción, si ya tiene, con lo que decide si admite a alguien más. */
export interface AssignedCourse {
  status: CourseStatus;
  maxStudents: number | null;
  /** Matrículas en curso; quien ya se certificó no ocupa plaza (ver `occupiedSeats`). */
  occupiedSeats: number;
}

export function waitingReasonFor(course: AssignedCourse | null): WaitingReason | null {
  if (!course) return 'COURSE_NOT_ASSIGNED';
  if (course.status !== 'PUBLISHED') return 'COURSE_NOT_PUBLISHED';
  if (course.maxStudents !== null && course.occupiedSeats >= course.maxStudents) return 'COURSE_FULL';
  return null;
}

/** Explicación de cada motivo, para la respuesta y para el aviso a los administradores. */
export const WAITING_REASON_TEXT: Record<WaitingReason, string> = {
  COURSE_NOT_ASSIGNED: 'todavía no se ha elegido el curso que la atiende',
  COURSE_NOT_PUBLISHED: 'su curso todavía no está publicado',
  COURSE_FULL: 'su curso no tiene plazas libres',
};

/** Lo que tiene que hacer un administrador para que entren, para su aviso. */
export const WAITING_REASON_FIX: Record<WaitingReason, string> = {
  COURSE_NOT_ASSIGNED: 'elige en Integraciones el curso que la atiende',
  COURSE_NOT_PUBLISHED: 'publica su curso',
  COURSE_FULL: 'amplía el cupo de su curso',
};

/** Lo guardado de una solicitud que interesa para contar en qué punto está. */
export interface StoredRequest {
  status: ExternalEnrollmentStatus;
  infraction: { code: string };
  rejectionReason: string | null;
  userGuid: string | null;
  courseGuid: string | null;
}

/** Lo que dice el resto del campus de esa solicitud. */
export interface CurrentFacts {
  /** Motivo de la espera, sólo si está esperando. */
  waitingReason: WaitingReason | null;
  /** Si la matrícula en la que quedó sigue activa. */
  enrollmentActive: boolean;
  courseTitle: string | null;
  certificateCode: string | null;
}

/**
 * En qué punto está una matrícula pedida por otro sistema, tal como se le responde: se calcula a
 * partir de lo guardado y de la propia matrícula, que es quien sabe si sigue en pie.
 */
export interface StatusReport {
  status: ExternalStatus;
  waitingReason: WaitingReason | null;
  /** La misma información en una frase, para quien la lea en el otro sistema. */
  detail: string;
}

export function statusReport(request: StoredRequest, facts: CurrentFacts): StatusReport {
  const report = (status: ExternalStatus, detail: string, waitingReason: WaitingReason | null = null) => ({
    status,
    waitingReason,
    detail,
  });

  switch (request.status) {
    case 'WAITING':
      return facts.waitingReason
        ? report(
            'WAITING',
            `En espera por la infracción ${request.infraction.code}: ${WAITING_REASON_TEXT[facts.waitingReason]}. La persona quedará matriculada en cuanto se resuelva.`,
            facts.waitingReason,
          )
        : report(
            'WAITING',
            'El curso ya está disponible: la solicitud se atenderá en la siguiente pasada, antes de una hora.',
          );
    case 'REJECTED':
      return report('REJECTED', request.rejectionReason ?? 'La solicitud no se pudo atender.');
    case 'COMPLETED':
      return report('COMPLETED', `La persona completó el curso. Certificado ${facts.certificateCode ?? 'emitido'}.`);
    case 'ENROLLED':
      return facts.enrollmentActive
        ? report('ENROLLED', `La persona está matriculada en «${facts.courseTitle}» y puede empezar cuando quiera.`)
        : report('CANCELLED', cancellationReason(request));
  }
}

function cancellationReason({ userGuid, courseGuid }: StoredRequest): string {
  if (!courseGuid) return 'Se eliminó el curso en el que estaba matriculada.';
  if (!userGuid) return 'Se eliminó la cuenta de la persona.';
  return 'Un administrador dio de baja la matrícula.';
}
