import type { ResourceKind } from './resources';

export const BUILDER_PATH = '/dashboard/course-builder';

/** Segmento del editor para un recurso que todavía no existe: se crea al guardarlo por primera vez. */
export const NEW_RESOURCE_SEGMENT = 'new';

/** El constructor con el curso abierto y, si se indica, un recurso suyo seleccionado. */
export function builderUrl(courseGuid: string, resource?: { moduleGuid: string; resourceGuid: string }): string {
  const params = new URLSearchParams({ course: courseGuid });
  if (resource) {
    params.set('module', resource.moduleGuid);
    params.set('resource', resource.resourceGuid);
  }
  return `${BUILDER_PATH}?${params}`;
}

export function resourceEditorUrl(courseGuid: string, moduleGuid: string, resourceGuid: string): string {
  return `${BUILDER_PATH}/${courseGuid}/modules/${moduleGuid}/resources/${resourceGuid}`;
}

export function newResourceEditorUrl(courseGuid: string, moduleGuid: string, kind: ResourceKind): string {
  return `${resourceEditorUrl(courseGuid, moduleGuid, NEW_RESOURCE_SEGMENT)}?type=${kind}`;
}
