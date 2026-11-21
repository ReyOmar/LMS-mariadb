'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlerts } from '@/contexts/AlertContext';
import { useStudyTime } from '@/hooks/useStudyTime';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import type { Resource } from '@/types/models';
import {
  buildSyllabus,
  findEntry,
  hasContentToLoad,
  isOnlyAwaitingGrades,
  isPathCompleted,
  moduleStart,
  pathProgressFrom,
  resumeEntry,
} from './components/progression';
import { useCourseContent } from './useCourseContent';
import { useCourseRound } from './useCourseRound';
import { useSyllabusPanel } from './useSyllabusPanel';

/**
 * Lo que hace el visor del curso: el temario según el avance, el recurso a la vista, la vuelta
 * (estudiando, celebrando, repasando) y el tiempo de estudio. La página sólo lo pinta.
 */
export function useCourseViewer(courseId: string) {
  const router = useRouter();
  const { showConfirmation } = useAlerts();
  const content = useCourseContent(courseId);
  const panel = useSyllabusPanel();
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [quizInProgress, setQuizInProgress] = useState(false);
  const { course, progress, reload } = content;

  const syllabus = useMemo(
    () =>
      course && progress
        ? buildSyllabus(course.modules ?? [], pathProgressFrom(progress), course.strictOrder ?? true)
        : null,
    [course, progress],
  );

  const round = useCourseRound(courseId, {
    pathCompleted: syllabus && isPathCompleted(syllabus),
    onlyAwaitingGrades: syllabus !== null && isOnlyAwaitingGrades(syllabus),
    quizInProgress,
  });

  // Con orden estricto el contenido de lo que aún no tocaba no viaja con el curso: se pide cuando
  // el avance lo abre.
  const contentToLoad = syllabus !== null && hasContentToLoad(syllabus);
  useEffect(() => {
    if (contentToLoad) reload();
  }, [contentToLoad, reload]);

  // Tiempo dedicado al curso: cuenta mientras se hace, no en mantenimiento ni al repasarlo terminado.
  const studying = round.stage === 'studying' && course?.status === 'PUBLISHED' && !content.leaving;
  useStudyTime(courseId, studying);

  useLeaveGuard(quizInProgress, {
    warning: 'Tienes un cuestionario en curso. ¿Salir igualmente?',
    onLeave: async (destination) => {
      const confirmed = await showConfirmation(
        'Cuestionario en curso',
        'El tiempo del intento sigue corriendo aunque salgas. Tus respuestas quedan guardadas en este navegador.',
        'Salir',
        'warning',
      );
      if (confirmed) router.push(destination);
    },
  });

  // Se abre por donde se quedó, y vuelve ahí si lo elegido desaparece o se cierra.
  const selected = syllabus && findEntry(syllabus, selectedGuid);
  const current = selected?.open ? selected : syllabus && resumeEntry(syllabus);
  const currentGuid = current?.resource.guid ?? null;
  // Lo que se ve queda elegido: completarlo no salta solo al siguiente recurso.
  useEffect(() => setSelectedGuid(currentGuid), [currentGuid]);

  const select = (resource: Resource) => {
    setSelectedGuid(resource.guid);
    panel.closeIfNarrow();
  };

  const onQuizFinished = async (quizGuid: string, passed: boolean) => {
    await content.refreshProgress();
    // Suspender devuelve al principio del módulo, para repasarlo antes de repetir.
    if (!passed && syllabus) setSelectedGuid(moduleStart(syllabus, quizGuid)?.guid ?? quizGuid);
  };

  return {
    content,
    panel,
    syllabus,
    round,
    readOnly: round.stage === 'reviewing',
    current,
    currentGuid,
    quizInProgress,
    setQuizInProgress,
    select,
    onQuizFinished,
  };
}
