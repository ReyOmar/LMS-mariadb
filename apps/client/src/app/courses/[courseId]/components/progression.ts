import type { CourseModule, Resource } from '@/types/models';

/**
 * Orden en que el alumno recorre un curso.
 *
 * La regla es que no se salta contenido: un recurso se abre cuando los anteriores de su
 * módulo están completados, y un módulo cuando el anterior lo está entero. Es la garantía
 * de que el certificado acredita haber pasado por todo el material, así que conviene que
 * viva en un sitio, sin estado ni marcado alrededor, y no repartida por la pantalla.
 *
 * Todas las funciones reciben la lista de completados en vez de leerla de fuera: así el
 * mismo cálculo sirve para pintar el temario, para decidir qué se abre y para elegir por
 * dónde retomar.
 */

/** Un módulo tal y como lo necesita el recorrido: sólo su lista ordenada de recursos. */
type PathModule = Pick<CourseModule, 'guid'> & { resources?: Pick<Resource, 'guid'>[] };

/**
 * Un módulo está abierto si el anterior se completó entero.
 * El primero siempre lo está, y un módulo vacío no bloquea a los siguientes: si no tiene
 * contenido, no hay nada que exigir antes de seguir.
 */
export function isModuleOpen(modules: PathModule[], index: number, completed: string[]): boolean {
  if (index <= 0) return true;

  const previousResources = modules[index - 1]?.resources ?? [];
  if (previousResources.length === 0) return true;

  return previousResources.every((resource) => completed.includes(resource.guid));
}

/** Un recurso está abierto si su módulo lo está y todos los que van antes se completaron. */
export function isResourceOpen(
  modules: PathModule[],
  moduleIndex: number,
  resourceIndex: number,
  completed: string[],
): boolean {
  if (!isModuleOpen(modules, moduleIndex, completed)) return false;
  if (resourceIndex <= 0) return true;

  const resources = modules[moduleIndex]?.resources ?? [];
  return resources.slice(0, resourceIndex).every((resource) => completed.includes(resource.guid));
}

/** Dónde está cada recurso dentro del curso. */
interface CoursePosition {
  moduleGuid: string;
  moduleIndex: number;
  resourceIndex: number;
}

/**
 * Primer recurso sin completar, que es por donde se retoma el curso.
 * Devuelve `null` cuando no queda ninguno: el curso está terminado.
 */
export function whereToResume(
  modules: PathModule[],
  completed: string[],
): (CoursePosition & { resourceGuid: string }) | null {
  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    const resources = modules[moduleIndex].resources ?? [];

    for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex++) {
      if (completed.includes(resources[resourceIndex].guid)) continue;

      return {
        resourceGuid: resources[resourceIndex].guid,
        moduleGuid: modules[moduleIndex].guid,
        moduleIndex,
        resourceIndex,
      };
    }
  }

  return null;
}

/** Último recurso del curso, que es lo que se abre cuando ya no queda nada pendiente. */
export function lastResource(modules: PathModule[]): (CoursePosition & { resourceGuid: string }) | null {
  for (let moduleIndex = modules.length - 1; moduleIndex >= 0; moduleIndex--) {
    const resources = modules[moduleIndex].resources ?? [];
    if (resources.length === 0) continue;

    return {
      resourceGuid: resources[resources.length - 1].guid,
      moduleGuid: modules[moduleIndex].guid,
      moduleIndex,
      resourceIndex: resources.length - 1,
    };
  }

  return null;
}
