import { CourseStatus, ExternalEnrollmentStatus } from '@prisma/client';

/**
 * En qué punto está una matrícula pedida por otro sistema, tal como se le responde.
 *
 * Es el contrato de la integración (ver `docs/INTEGRACION.md`): estos valores no se renombran.
 * Se calcula a partir de lo guardado y de la propia matrícula, que es quien sabe si sigue en pie.
 */
export const EXTERNAL_STATUSES = ['WAITING', 'ENROLLED', 'COMPLETED', 'CANCELLED', 'REJECTED'] as const;
export type ExternalStatus = (typeof EXTERNAL_STATUSES)[number];

/** Por qué espera: lo que tiene que hacer un administrador para que se atienda. */
export const WAITING_REASONS = ['COURSE_NOT_FOUND', 'COURSE_NOT_PUBLISHED', 'COURSE_FULL'] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];

/** El curso que lleva el código pedido, si existe, con lo que decide si admite a alguien más. */
export interface CourseForCode {
  status: CourseStatus;
  maxStudents: number | null;
  /** Matrículas en curso; quien ya se certificó no ocupa plaza (ver `occupiedSeats`). */
  occupiedSeats: number;
}

export function waitingReasonFor(course: CourseForCode | null): WaitingReason | null {
  if (!course) return 'COURSE_NOT_FOUND';
  if (course.status !== 'PUBLISHED') return 'COURSE_NOT_PUBLISHED';
  if (course.maxStudents !== null && course.occupiedSeats >= course.maxStudents) return 'COURSE_FULL';
  return null;
}

/** Explicación de cada motivo, para la respuesta y para el aviso a los administradores. */
export const WAITING_REASON_TEXT: Record<WaitingReason, string> = {
  COURSE_NOT_FOUND: 'todavía no hay ningún curso con ese código',
  COURSE_NOT_PUBLISHED: 'el curso con ese código todavía no está publicado',
  COURSE_FULL: 'el curso con ese código no tiene plazas libres',
};

/** Lo guardado de una solicitud que interesa para contar en qué punto está. */
export interface StoredRequest {
  status: ExternalEnrollmentStatus;
  courseCode: string;
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
            `En espera: ${WAITING_REASON_TEXT[facts.waitingReason]} (${request.courseCode}). La persona quedará matriculada en cuanto lo haya.`,
            facts.waitingReason,
          )
        : report(
            'WAITING',
            'El curso ya está disponible: la persona quedará matriculada en la siguiente pasada, antes de una hora.',
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
