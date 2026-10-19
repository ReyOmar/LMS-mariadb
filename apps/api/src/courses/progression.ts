import type { SubmissionStatus } from '@prisma/client';

/**
 * Orden en que el alumno recorre un curso con orden estricto.
 *
 * Es la misma regla que aplica el visor del curso (`apps/client/src/app/courses/[courseId]/
 * components/progression.ts`): un recurso se abre cuando todos los que van antes en el temario,
 * de su módulo y de los anteriores, están completados. El servidor la repite para que saltarse
 * el temario no dependa de lo que pinte el navegador.
 *
 * «Completado» incluye lo desbloqueado por espera (`waitedTooLong`), igual que en el visor.
 */

/**
 * Horas que una entrega puede llevar esperando calificación antes de que el sistema
 * desbloquee el siguiente recurso por su cuenta.
 *
 * Existe para que un examinador ausente no deje a un alumno bloqueado indefinidamente. El
 * desbloqueo no da la tarea por aprobada: sólo permite seguir estudiando mientras llega la
 * corrección, y el certificado sigue exigiendo que todas las tareas estén calificadas.
 */
export const AUTO_UNLOCK_HOURS = 48;

/** Estados de una entrega ya enviada que todavía espera su nota. */
export const AWAITING_GRADE: SubmissionStatus[] = ['SUBMITTED', 'IN_REVIEW'];

/** Un módulo tal y como lo necesita el recorrido: sólo su lista ordenada de recursos. */
export interface PathModule {
  resources: { guid: string }[];
}

/** Una entrega pendiente desbloquea lo siguiente cuando lleva demasiado esperando nota. */
export function waitedTooLong(submittedAt: Date | null, now = Date.now()): boolean {
  return submittedAt !== null && submittedAt.getTime() <= now - AUTO_UNLOCK_HOURS * 60 * 60 * 1000;
}

/** Si el recurso indicado está abierto. Uno que no pertenece al curso no lo está. */
export function isResourceUnlocked(
  modules: PathModule[],
  resourceGuid: string,
  completed: ReadonlySet<string>,
): boolean {
  const path = modules.flatMap((module) => module.resources);
  const position = path.findIndex((resource) => resource.guid === resourceGuid);
  return position >= 0 && path.slice(0, position).every((resource) => completed.has(resource.guid));
}
