'use client';

import type { QuizAttempt } from '../../types';
import { useReleaseAttempt } from '../../hooks/useReleaseAttempt';
import { getAttemptScore, withoutAttempt, type StudentAttempts, type StudentWithAttempts } from './results';

type UpdateItems = (change: (rows: StudentAttempts[]) => StudentAttempts[]) => void;

/** «Habilitar otro intento» en la lista del curso: al liberarlo, el intento retirado sale de lo cargado. */
export function useAttemptRelease(updateItems: UpdateItems, onReleased: () => void) {
  const release = useReleaseAttempt();

  return async ({ student }: StudentWithAttempts, attempt: QuizAttempt) => {
    if (!attempt.assignmentGuid || !student) return;

    const released = await release({
      resourceGuid: attempt.assignmentGuid,
      student,
      score: getAttemptScore(attempt),
    });
    if (!released) return;

    updateItems((rows) => withoutAttempt(rows, attempt.guid));
    onReleased();
  };
}
