'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { uploadImage } from '@/lib/image-upload';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { Course, CourseStatus } from '@/types/models';
import { changedFields, deletionWarning, publishBlocker, unpublishWarning } from './components/course-changes';

/** Quiénes están matriculados ahora, para los avisos; `null` si no se pudo saber. */
async function enrolledCount(courseGuid: string): Promise<number | null> {
  try {
    const { data } = await api.get<{ total?: number }>(`/enrollments/${courseGuid}`);
    return data.total ?? 0;
  } catch {
    return null;
  }
}

/**
 * El curso abierto en el constructor y los cambios de su ficha. Cada cambio se aplica sobre el
 * curso más reciente, no sobre el de la pantalla en que se pidió: dos guardados seguidos no se pisan.
 *
 * @param onRemoved Otra persona borró el curso mientras estaba abierto.
 */
export function useCourseWorkspace(courseGuid: string, onRemoved: () => void) {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(course);
  latest.current = course;

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get<Course>(`/courses/${courseGuid}/manage`);
      setCourse(data);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo abrir el curso.'));
    }
  }, [courseGuid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtimeEvent('course:updated', (data) => {
    if ((data as { guid?: string }).guid === courseGuid) void reload();
  });
  useRealtimeEvent('course:deleted', (data) => {
    if ((data as { guid?: string }).guid !== courseGuid) return;
    notify.info('El curso se ha eliminado');
    onRemoved();
  });
  useRealtimeReconnect(() => void reload());

  const update = useCallback((change: (current: Course) => Course) => {
    setCourse((current) => current && change(current));
  }, []);

  /** Ejecuta un cambio y avisa si falla, con el mensaje de la API tal cual. */
  const attempt = useCallback(
    async (failureTitle: string, action: () => Promise<void>): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (failure) {
        showAlert.error(failureTitle, errorMessage(failure));
        return false;
      }
    },
    [showAlert],
  );

  const patchCourse = useCallback(
    (failureTitle: string, changes: Partial<Course>) =>
      attempt(failureTitle, async () => {
        await api.patch(`/courses/${courseGuid}`, changes);
        update((current) => ({ ...current, ...changes }));
      }),
    [attempt, courseGuid, update],
  );

  const saveFields = async (changes: Partial<Course>) => {
    const applied = latest.current && changedFields(latest.current, changes);
    if (applied) await patchCourse('No se pudo actualizar el curso', applied);
  };

  const publish = async (): Promise<boolean> => {
    const blocker = latest.current && publishBlocker(latest.current);
    if (blocker) {
      showAlert.warning('Todavía no se puede publicar', blocker);
      return false;
    }
    return patchCourse('No se pudo publicar el curso', { status: 'PUBLISHED' });
  };

  const unpublish = async () => {
    const confirmed = await showConfirmation(
      'Pasar el curso a Borrador',
      unpublishWarning(await enrolledCount(courseGuid)),
      'Pasar a Borrador',
      'warning',
    );
    if (confirmed) await patchCourse('No se pudo pasar a Borrador', { status: 'DRAFT' });
  };

  const changeStatus = (status: CourseStatus) => (status === 'PUBLISHED' ? publish() : unpublish());

  /** @returns Si se borró, para salir del curso. */
  const deleteCourse = async (): Promise<boolean> => {
    if (!latest.current) return false;
    const warning = deletionWarning(latest.current, await enrolledCount(courseGuid));
    if (!(await showConfirmation('Eliminar curso', warning))) return false;
    return attempt('No se pudo eliminar el curso', async () => {
      await api.delete(`/courses/${courseGuid}`);
    });
  };

  const saveCover = (file: File) =>
    attempt('No se pudo guardar la portada', async () => {
      const coverImage = await uploadImage(file, 'portadas');
      await api.patch(`/courses/${courseGuid}`, { coverImage });
      update((current) => ({ ...current, coverImage }));
    });

  const removeCover = async () => {
    const confirmed = await showConfirmation(
      'Quitar la portada',
      'La imagen se borrará del servidor y el curso se mostrará sin portada.',
      'Quitar portada',
    );
    if (confirmed) await patchCourse('No se pudo quitar la portada', { coverImage: null });
  };

  return {
    course,
    error,
    reload,
    update,
    attempt,
    saveFields,
    publish,
    changeStatus,
    deleteCourse,
    saveCover,
    removeCover,
  };
}

export type CourseWorkspace = ReturnType<typeof useCourseWorkspace>;
