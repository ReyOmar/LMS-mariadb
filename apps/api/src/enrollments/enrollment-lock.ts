import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** La matrícula tal como queda bloqueada: lo que deciden quienes esperan su turno. */
export interface LockedEnrollment {
  active: boolean;
  completedAt: Date | null;
}

/** Lo que se responde a quien intenta trabajar sobre una vuelta cerrada. */
export interface ClosedRoundMessages {
  /** Sin matrícula o dada de baja. */
  unenrolled: string;
  /** Terminada con su certificado. */
  certified: string;
}

/**
 * Una vuelta dada de baja o ya certificada no admite trabajo nuevo: cambiarla alteraría lo que
 * respalda el certificado y un archivo entregado después ya no se retiraría.
 *
 * @throws ForbiddenException con el mensaje que corresponde.
 */
export function assertRoundOpen(enrollment: LockedEnrollment | null | undefined, messages: ClosedRoundMessages): void {
  if (!enrollment?.active) throw new ForbiddenException(messages.unenrolled);
  if (enrollment.completedAt) throw new ForbiddenException(messages.certified);
}

/**
 * Pone en fila lo que se hace sobre el trabajo de un alumno en un curso —abrir, corregir o
 * devolver un intento, entregar o calificar una tarea, emitir el certificado—: bloquea la fila
 * de su matrícula hasta que termina la transacción. Sin ello, dos peticiones simultáneas
 * leerían el mismo estado y escribirían las dos como si fueran la única.
 *
 * Tiene que ser lo primero que toca la transacción, para que todas tomen los bloqueos en el
 * mismo orden. Devuelve la matrícula, o `undefined` si no existe.
 */
export async function lockEnrollment(
  tx: Prisma.TransactionClient,
  userGuid: string,
  courseGuid: string,
): Promise<LockedEnrollment | undefined> {
  const [enrollment] = await tx.$queryRaw<{ active: number; completedAt: Date | null }[]>`
    SELECT activa AS active, fecha_finalizacion AS completedAt FROM lms_matriculas
    WHERE usuario_guid = ${userGuid} AND curso_guid = ${courseGuid}
    FOR UPDATE`;
  return enrollment && { active: Boolean(enrollment.active), completedAt: enrollment.completedAt };
}

/** Tras el bloqueo, cada lectura ve lo último confirmado y no la foto del inicio de la transacción. */
export const AFTER_LOCK = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
