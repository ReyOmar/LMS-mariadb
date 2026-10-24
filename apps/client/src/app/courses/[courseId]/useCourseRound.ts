'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import api from '@/lib/api';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { Certificate, Course } from '@/types/models';
import { INITIAL_ROUND, roundReducer, shouldAskRound } from './components/course-round';

/** Pausa entre cerrar el resultado del cuestionario que terminó el curso y la felicitación. */
const CELEBRATION_DELAY_MS = 1000;

/**
 * El certificado que cerró la vuelta actual, o `null` si sigue en curso o no se pudo saber. Lo dice la
 * matrícula (`completedAt`): un certificado de una vuelta anterior no cierra el curso que se repite.
 */
async function closedRound(courseGuid: string): Promise<{ certificateGuid: string | null } | null> {
  try {
    const { data: courses } = await api.get<Course[]>('/courses');
    if (!courses.find((course) => course.guid === courseGuid)?.completedAt) return null;

    // Llegan del más reciente al más antiguo: el primero de este curso es el de esta vuelta.
    const { data: certificates } = await api.get<Certificate[]>('/certificates');
    return { certificateGuid: certificates.find((certificate) => certificate.courseGuid === courseGuid)?.guid ?? null };
  } catch {
    return null;
  }
}

interface RoundSignals {
  /** Todo está completado: el servidor pudo cerrar ya la vuelta. `null` mientras carga el avance. */
  pathCompleted: boolean | null;
  /** El alumno hizo todo lo suyo y sólo faltan notas. */
  onlyAwaitingGrades: boolean;
  /** La felicitación no tapa el resultado del cuestionario que acaba de terminar. */
  quizInProgress: boolean;
}

/** En qué punto está la vuelta del alumno (ver `course-round.ts`) y el certificado que la cerró. */
export function useCourseRound(
  courseGuid: string,
  { pathCompleted, onlyAwaitingGrades, quizInProgress }: RoundSignals,
) {
  const [round, dispatch] = useReducer(roundReducer, INITIAL_ROUND);
  const [certificateGuid, setCertificateGuid] = useState<string | null>(null);

  const checkRound = useCallback(async () => {
    const closed = await closedRound(courseGuid);
    if (closed?.certificateGuid) setCertificateGuid(closed.certificateGuid);
    dispatch({ type: 'checked', finished: closed !== null });
  }, [courseGuid]);

  const asked = useRef(false);
  useEffect(() => {
    if (pathCompleted === null) return;
    if (shouldAskRound(!asked.current, pathCompleted)) void checkRound();
    asked.current = true;
  }, [pathCompleted, checkRound]);

  useRealtimeEvent('certificate:new', (data) => {
    const certificate = data as { guid?: string; courseGuid?: string };
    if (certificate.courseGuid !== courseGuid) return;
    if (certificate.guid) setCertificateGuid(certificate.guid);
    dispatch({ type: 'certificate-issued' });
  });
  // El certificado pudo llegar mientras el tiempo real estaba cortado.
  useRealtimeReconnect(() => void checkRound());

  useEffect(() => {
    if (round.stage !== 'celebration-pending' || quizInProgress) return;
    const timer = setTimeout(() => dispatch({ type: 'celebrate' }), CELEBRATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [round.stage, quizInProgress]);

  useEffect(() => {
    dispatch({ type: onlyAwaitingGrades ? 'awaiting-grades' : 'grade-arrived' });
  }, [onlyAwaitingGrades, round.stage]);

  return {
    stage: round.stage,
    ungradedNoticeOpen: round.ungradedNotice === 'open',
    /** Lleva a la ficha del certificado de este curso en cuanto se conoce. */
    certificatesUrl: `/dashboard/student/certificates${certificateGuid ? `?open=${certificateGuid}` : ''}`,
    review: () => dispatch({ type: 'review' }),
    acknowledgeUngraded: () => dispatch({ type: 'acknowledge-ungraded' }),
  };
}
