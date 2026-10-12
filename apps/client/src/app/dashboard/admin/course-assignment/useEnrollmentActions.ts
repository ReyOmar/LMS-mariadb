'use client';

import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import {
  batchSummary,
  fullName,
  restartWarning,
  UNENROLL_WARNING,
  type Candidate,
  type EnrolledStudent,
  type EnrollmentFailure,
} from './assignment';

export interface BatchProgress {
  done: number;
  total: number;
}

interface Handlers {
  onEnrolled: (guids: string[]) => void;
  onUnenrolled: (guid: string) => void;
  /** Las listas del curso quedaron desfasadas: hay que volver a pedirlas. */
  refreshLists: () => void;
}

/** Desfase de la lista: el alumno ya está dentro, o terminó el curso después de cargarla. */
const isStaleCandidate = (error: unknown) => isAxiosError(error) && error.response?.status === 409;

export function useEnrollmentActions(courseGuid: string, handlers: Handlers) {
  const { notify, showAlert, showConfirmation } = useAlerts();
  const enrolling = useInFlight<string>();
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const batchRunning = useRef(false);
  const courseUrl = `/enrollments/${encodeURIComponent(courseGuid)}`;

  const confirmRestart = (names: string[]) =>
    showConfirmation('¿Volver a empezar el curso?', restartWarning(names), 'Matricular de nuevo', 'danger');

  const enroll = (candidate: Candidate) =>
    api.post(courseUrl, { userGuid: candidate.guid, confirmRestart: candidate.certified });

  const enrollOne = (candidate: Candidate) =>
    enrolling.run(candidate.guid, async () => {
      if (candidate.certified && !(await confirmRestart([fullName(candidate)]))) return;
      try {
        await enroll(candidate);
        notify.success('Estudiante matriculado');
        handlers.onEnrolled([candidate.guid]);
      } catch (error) {
        notify.error(errorMessage(error, 'No se pudo matricular al estudiante.'));
        if (isStaleCandidate(error)) handlers.refreshLists();
      }
    });

  const enrollBatch = async (students: Candidate[]) => {
    if (students.length === 0 || batchRunning.current) return;
    batchRunning.current = true;
    try {
      await enrollEach(students);
    } finally {
      batchRunning.current = false;
      setBatchProgress(null);
    }
  };

  /** De uno en uno: el servidor comprueba el cupo en cada alta y el resumen dice quién no entró y por qué. */
  const enrollEach = async (students: Candidate[]) => {
    const certified = students.filter((student) => student.certified).map(fullName);
    if (certified.length > 0 && !(await confirmRestart(certified))) return;

    const added: string[] = [];
    const failures: EnrollmentFailure[] = [];
    setBatchProgress({ done: 0, total: students.length });
    for (const [index, student] of students.entries()) {
      try {
        await enroll(student);
        added.push(student.guid);
      } catch (error) {
        failures.push({ name: fullName(student), reason: errorMessage(error, 'No se pudo matricular.') });
      }
      setBatchProgress({ done: index + 1, total: students.length });
    }

    const summary = batchSummary(added.length, failures);
    if (failures.length === 0) notify.success(summary.title);
    else if (added.length === 0) showAlert.error(summary.title, summary.message);
    else showAlert.warning(summary.title, summary.message, false);
    handlers.onEnrolled(added);
    handlers.refreshLists();
  };

  const unenroll = async (student: EnrolledStudent) => {
    const confirmed = await showConfirmation(
      `¿Desmatricular a ${fullName(student)}?`,
      UNENROLL_WARNING,
      'Desmatricular',
    );
    if (!confirmed) return;
    try {
      await api.delete(`${courseUrl}/${encodeURIComponent(student.guid)}`);
      notify.success('Estudiante removido');
      handlers.onUnenrolled(student.guid);
    } catch (error) {
      notify.error(errorMessage(error, 'No se pudo retirar al estudiante.'));
    }
  };

  return { enrollOne, enrollBatch, unenroll, isEnrolling: enrolling.has, batchProgress };
}
