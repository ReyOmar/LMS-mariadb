import { Prisma } from '@prisma/client';

/**
 * Marca un recurso como completado por el alumno y actualiza el recuento de su matrícula.
 *
 * Es idempotente (`upsert` y no `create`): el mismo recurso puede completarse a la vez por
 * dos vías —el alumno aprobando y el desbloqueo por espera, por ejemplo— y la segunda no
 * debe fallar por la restricción única.
 */
export async function recordCompletion(
  prisma: Prisma.TransactionClient,
  userGuid: string,
  resourceGuid: string,
  courseGuid: string,
): Promise<void> {
  await prisma.resourceProgress.upsert({
    where: { userGuid_resourceGuid: { userGuid, resourceGuid } },
    create: { userGuid, resourceGuid, completed: true },
    update: {},
  });
  await refreshCompletedResources(prisma, userGuid, courseGuid);
}

/**
 * Recalcula `recursos_completados` de la matrícula del alumno en el curso.
 *
 * Se recuenta en vez de sumar o restar uno: así da igual cuántas filas acabe de crear o
 * borrar quien llama, y dos cambios casi simultáneos no pueden dejar el número desviado
 * más allá de la siguiente llamada. Cuesta un puñado de lecturas por índice (≈1 ms).
 * Quien añada o retire progreso tiene que llamarla después.
 */
export function refreshCompletedResources(prisma: Prisma.TransactionClient, userGuid: string, courseGuid: string) {
  return recount(prisma, Prisma.sql`m.usuario_guid = ${userGuid} AND m.curso_guid = ${courseGuid}`);
}

/** Lo mismo para varias matrículas a la vez, por su identificador. */
export function refreshCompletedResourcesOf(prisma: Prisma.TransactionClient, enrollmentIds: number[]) {
  return recount(prisma, Prisma.sql`m.id IN (${Prisma.join(enrollmentIds)})`);
}

/** Recuenta las matrículas (alias `m`) que cumplen `enrollments`. */
function recount(prisma: Prisma.TransactionClient, enrollments: Prisma.Sql) {
  return prisma.$executeRaw`
    UPDATE lms_matriculas m
    SET m.recursos_completados = (
      SELECT COUNT(*)
      FROM lms_progreso_recurso p
      JOIN lms_recursos r ON r.guid = p.recurso_guid
      JOIN lms_modulos mo ON mo.guid = r.modulo_guid
      WHERE p.usuario_guid = m.usuario_guid AND mo.curso_guid = m.curso_guid
    )
    WHERE ${enrollments}`;
}
