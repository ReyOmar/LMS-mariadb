import type { Course, CourseModule, Resource } from '@/types/models';

/** Qué está abierto en el panel central. Sólo identificadores: el contenido se lee siempre del curso. */
export type Selection =
  | { type: 'NONE' }
  | { type: 'MODULE'; moduleGuid: string }
  | { type: 'RESOURCE'; moduleGuid: string; resourceGuid: string };

export type SelectedItem =
  | { type: 'NONE' }
  | { type: 'MODULE'; module: CourseModule }
  | { type: 'RESOURCE'; module: CourseModule; resource: Resource };

export const NO_SELECTION = { type: 'NONE' } as const;

/** La selección con la que se abre el curso: el recurso que trae la dirección, si trae uno. */
export function selectionFromAddress(moduleGuid: string | null, resourceGuid: string | null): Selection {
  return moduleGuid && resourceGuid ? { type: 'RESOURCE', moduleGuid, resourceGuid } : NO_SELECTION;
}

/** Lo seleccionado tal como está ahora en el curso; si se borró, no hay selección. */
export function resolveSelection(course: Pick<Course, 'modules'>, selection: Selection): SelectedItem {
  if (selection.type === 'NONE') return NO_SELECTION;

  const courseModule = course.modules?.find((candidate) => candidate.guid === selection.moduleGuid);
  if (!courseModule) return NO_SELECTION;
  if (selection.type === 'MODULE') return { type: 'MODULE', module: courseModule };

  const resource = courseModule.resources?.find((candidate) => candidate.guid === selection.resourceGuid);
  return resource ? { type: 'RESOURCE', module: courseModule, resource } : NO_SELECTION;
}

function sameSelection(a: Selection, b: Selection): boolean {
  if (a.type === 'NONE' || b.type === 'NONE') return a.type === b.type;
  if (a.type !== b.type || a.moduleGuid !== b.moduleGuid) return false;
  return a.type === 'MODULE' || (b.type === 'RESOURCE' && a.resourceGuid === b.resourceGuid);
}

/** Elegir lo que ya está seleccionado lo cierra. */
export function toggleSelection(current: Selection, picked: Selection): Selection {
  return sameSelection(current, picked) ? NO_SELECTION : picked;
}
