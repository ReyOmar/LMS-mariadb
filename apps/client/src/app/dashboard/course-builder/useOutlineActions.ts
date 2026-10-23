'use client';

import api from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import type { CourseModule, Resource } from '@/types/models';
import { moduleDeletionWarning, resourceDeletionWarning } from './components/course-changes';
import {
  moduleOrder,
  resourceOrder,
  withMovedModule,
  withMovedResource,
  withRenamedModule,
  withoutModule,
  withoutResource,
} from './components/outline-edits';
import type { CourseWorkspace } from './useCourseWorkspace';

/** Módulos y recursos del temario: crear, renombrar, borrar y reordenar. */
export function useOutlineActions({ course, reload, update, attempt }: CourseWorkspace) {
  const { showConfirmation } = useAlerts();
  const creating = useInFlight<'module'>();
  const courseGuid = course?.guid;

  const createModule = () =>
    void creating.run('module', async () => {
      const title = `Módulo ${(course?.modules?.length ?? 0) + 1} Nuevo`;
      const created = await attempt('No se pudo crear el módulo', async () => {
        await api.post(`/courses/${courseGuid}/modules`, { title });
      });
      if (created) await reload();
    });

  /** @returns Si el módulo queda con ese nombre. */
  const renameModule = async (moduleGuid: string, title: string): Promise<boolean> => {
    const current = course?.modules?.find((courseModule) => courseModule.guid === moduleGuid);
    if (!current || current.title === title) return true;
    return attempt('No se pudo renombrar el módulo', async () => {
      await api.patch(`/courses/modules/${moduleGuid}`, { title });
      update((latest) => withRenamedModule(latest, moduleGuid, title));
    });
  };

  const deleteModule = async (courseModule: CourseModule) => {
    const confirmed = await showConfirmation('Eliminar módulo', moduleDeletionWarning(courseModule));
    if (!confirmed) return;
    await attempt('No se pudo eliminar el módulo', async () => {
      await api.delete(`/courses/modules/${courseModule.guid}`);
      update((latest) => withoutModule(latest, courseModule.guid));
    });
  };

  const deleteResource = async (resource: Resource) => {
    const confirmed = await showConfirmation('Eliminar recurso', resourceDeletionWarning(resource));
    if (!confirmed) return;
    await attempt('No se pudo eliminar el recurso', async () => {
      await api.delete(`/courses/resources/${resource.guid}`);
      update((latest) => withoutResource(latest, resource.guid));
    });
  };

  /** Reordena en pantalla primero y confirma después; si la API falla, vuelve el orden real. */
  const moveResource = async (moduleGuid: string, from: number, to: number) => {
    if (!course || from === to) return;
    const moved = withMovedResource(course, moduleGuid, from, to);
    update((latest) => withMovedResource(latest, moduleGuid, from, to));

    const saved = await attempt('No se pudo guardar el nuevo orden', async () => {
      await api.patch(`/courses/modules/${moduleGuid}/resources/order`, { guids: resourceOrder(moved, moduleGuid) });
    });
    if (!saved) await reload();
  };

  /** Como `moveResource`, para los módulos del curso. */
  const moveModule = async (from: number, to: number) => {
    if (!course || from === to) return;
    const moved = withMovedModule(course, from, to);
    update((latest) => withMovedModule(latest, from, to));

    const saved = await attempt('No se pudo guardar el nuevo orden', async () => {
      await api.patch(`/courses/${course.guid}/modules/order`, { guids: moduleOrder(moved) });
    });
    if (!saved) await reload();
  };

  return { createModule, renameModule, deleteModule, deleteResource, moveResource, moveModule };
}
