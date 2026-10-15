'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import api, { errorMessage } from '@/lib/api';
import { isQuiz } from '@/lib/resources';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useCurrentList } from '@/hooks/useCurrentList';
import { useInFlight } from '@/hooks/useInFlight';
import { clearQuizDraft } from '@/components/quiz/quiz-draft';
import type { Course, CourseProgress, Resource } from '@/types/models';

export const MY_COURSES = '/dashboard/student/courses';

/** 403 o 404: el alumno fue dado de baja, el curso pasó a mantenimiento o desapareció lo pedido. */
function isAccessLost(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 403 || status === 404;
}

function resourcesOf(course: Course | null): Resource[] {
  return (course?.modules ?? []).flatMap((courseModule) => courseModule.resources ?? []);
}

/**
 * El curso y el avance del alumno, al día con lo que cambia fuera: calificaciones, cambios del
 * curso, bajas. Si el alumno pierde el acceso, lo saca a su lista de cursos con la explicación.
 */
export function useCourseContent(courseId: string) {
  const router = useRouter();
  const { notify, showAlert } = useAlerts();
  const courseRequests = useCurrentList();
  const progressRequests = useCurrentList();
  const marking = useInFlight<string>();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);

  // Las cargas memorizadas los consultan sin volver a crearse en cada cambio.
  const latest = useRef({ course, progress });
  latest.current = { course, progress };

  const leaveCourse = useCallback(
    (title: string, message: string) => {
      // La baja puede llegar a la vez por tiempo real y por varias peticiones rechazadas.
      if (left.current) return;
      left.current = true;
      resourcesOf(latest.current.course)
        .filter((resource) => isQuiz(resource))
        .forEach((quiz) => clearQuizDraft(quiz.guid));
      setLeaving(true);
      notify.warning(title, message);
      router.replace(MY_COURSES);
    },
    [notify, router],
  );

  /** Sin nada cargado el fallo ocupa la pantalla; con algo a la vista basta un aviso. */
  const reportFailure = useCallback(
    (error: unknown, fallback: string, somethingShown: boolean) => {
      if (isAccessLost(error)) leaveCourse('No puedes abrir este curso', errorMessage(error));
      else if (somethingShown) notify.error('No se pudo actualizar el curso', errorMessage(error, fallback));
      else setLoadError(errorMessage(error, fallback));
    },
    [leaveCourse, notify],
  );

  const loadCourse = useCallback(async (): Promise<Course | null> => {
    const isCurrent = courseRequests.start();
    try {
      // Sin publicar, la API sólo manda la cabecera: el visor enseña el aviso de mantenimiento.
      const { data } = await api.get<Course>(`/courses/${courseId}`);
      if (!isCurrent()) return null;
      setCourse(data);
      return data;
    } catch (error) {
      if (isCurrent()) reportFailure(error, 'No se pudo cargar el curso.', latest.current.course !== null);
      return null;
    }
  }, [courseId, courseRequests, reportFailure]);

  const loadProgress = useCallback(async () => {
    const isCurrent = progressRequests.start();
    try {
      const { data } = await api.get<CourseProgress>(`/students/progress/${courseId}`);
      if (isCurrent()) setProgress(data);
    } catch (error) {
      if (isCurrent())
        reportFailure(error, 'No se pudo cargar tu avance en el curso.', latest.current.progress !== null);
    }
  }, [courseId, progressRequests, reportFailure]);

  const loadAll = useCallback(() => {
    void loadCourse();
    void loadProgress();
  }, [loadCourse, loadProgress]);

  useEffect(() => loadAll(), [loadAll]);

  /**
   * Un rechazo por falta de acceso puede ser una baja, el paso a mantenimiento o un recurso
   * retirado: la ficha del curso lo aclara. Devuelve si se ha hecho cargo del error.
   */
  const handleAccessError = useCallback(
    (error: unknown, title: string): boolean => {
      if (!isAccessLost(error)) return false;
      void loadCourse().then((current) => {
        if (current?.status !== 'PUBLISHED') return;
        showAlert.error(title, errorMessage(error));
        void loadProgress();
      });
      return true;
    },
    [loadCourse, loadProgress, showAlert],
  );

  const markCompleted = (resourceGuid: string) =>
    marking.run(resourceGuid, async () => {
      try {
        await api.post('/students/complete-resource', { resourceGuid });
        setProgress((current) => current && { ...current, completed: [...current.completed, resourceGuid] });
      } catch (error) {
        const title = 'No se pudo marcar como completado';
        if (!handleAccessError(error, title)) showAlert.error(title, errorMessage(error));
      }
    });

  useRealtimeEvent('submission:graded', (data) => {
    const { assignmentGuid } = data as { assignmentGuid?: string };
    if (resourcesOf(latest.current.course).some((resource) => resource.guid === assignmentGuid)) void loadProgress();
  });
  // Llega también al pasar a mantenimiento y al volver a publicar, con el estado nuevo.
  useRealtimeEvent('course:updated', (data) => {
    if ((data as { guid?: string }).guid === courseId) loadAll();
  });
  useRealtimeEvent('enrollment:changed', (data) => {
    const event = data as { action?: string; courseGuid?: string };
    if (event.action !== 'unenrolled' || event.courseGuid !== courseId) return;
    leaveCourse(
      'Ya no estás matriculado en este curso',
      'Tu matrícula fue dada de baja. Si crees que es un error, contacta con el administrador.',
    );
  });
  useRealtimeEvent('course:deleted', (data) => {
    if ((data as { guid?: string }).guid !== courseId) return;
    leaveCourse('Este curso ya no está disponible', 'El curso fue eliminado de la plataforma.');
  });
  useRealtimeReconnect(loadAll);

  return {
    course,
    progress,
    loadError,
    leaving,
    retry: () => {
      setLoadError(null);
      loadAll();
    },
    refreshProgress: loadProgress,
    handleAccessError,
    markCompleted,
    isMarking: marking.has,
  };
}
