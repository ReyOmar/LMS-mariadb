/**
 * Orden en que el alumno recorre un curso con orden estricto.
 *
 * Es la misma regla que aplica el visor del curso (`apps/client/src/app/courses/[courseId]/
 * components/progression.ts`): un recurso se abre cuando los anteriores de su módulo están
 * completados, y un módulo cuando el anterior lo está entero. El servidor la repite para que
 * saltarse el temario no dependa de lo que pinte el navegador.
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

/** Un módulo tal y como lo necesita el recorrido: sólo su lista ordenada de recursos. */
export interface PathModule {
  resources: { guid: string }[];
}

/** Una entrega pendiente desbloquea lo siguiente cuando lleva demasiado esperando nota. */
export function waitedTooLong(submittedAt: Date | null, now = Date.now()): boolean {
  return submittedAt !== null && submittedAt.getTime() <= now - AUTO_UNLOCK_HOURS * 60 * 60 * 1000;
}

/**
 * Un módulo está abierto si el anterior se completó entero.
 * El primero siempre lo está, y un módulo vacío no bloquea a los siguientes.
 */
export function isModuleOpen(modules: PathModule[], index: number, completed: ReadonlySet<string>): boolean {
  if (index <= 0) return true;
  return (modules[index - 1]?.resources ?? []).every((resource) => completed.has(resource.guid));
}

/** Un recurso está abierto si su módulo lo está y todos los que van antes se completaron. */
export function isResourceOpen(
  modules: PathModule[],
  moduleIndex: number,
  resourceIndex: number,
  completed: ReadonlySet<string>,
): boolean {
  if (!isModuleOpen(modules, moduleIndex, completed)) return false;
  const resources = modules[moduleIndex]?.resources ?? [];
  return resources.slice(0, Math.max(resourceIndex, 0)).every((resource) => completed.has(resource.guid));
}

/** Si el recurso indicado está abierto. Uno que no pertenece al curso no lo está. */
export function isResourceUnlocked(
  modules: PathModule[],
  resourceGuid: string,
  completed: ReadonlySet<string>,
): boolean {
  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const resourceIndex = modules[moduleIndex].resources.findIndex((resource) => resource.guid === resourceGuid);
    if (resourceIndex >= 0) return isResourceOpen(modules, moduleIndex, resourceIndex, completed);
  }
  return false;
}
