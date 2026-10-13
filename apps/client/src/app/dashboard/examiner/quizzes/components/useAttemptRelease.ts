'use client';

import api, { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/country';
import { useAlerts } from '@/contexts/AlertContext';
import { useCountry } from '@/contexts/CountryContext';
import type { ExaminerSubmission } from '../../types';
import { getAttemptScore, withoutAttempt, type StudentAttempts, type StudentWithAttempts } from './results';

type UpdateItems = (change: (rows: StudentAttempts[]) => StudentAttempts[]) => void;

/** «Habilitar otro intento»: el servidor libera uno retirando el último, y la confirmación dice qué nota se pierde. */
export function useAttemptRelease(updateItems: UpdateItems, onReleased: () => void) {
  const { notify, showAlert, showConfirmation } = useAlerts();
  const { country } = useCountry();

  return async ({ student }: StudentWithAttempts, attempt: ExaminerSubmission) => {
    if (!attempt.assignmentGuid || !student) return;

    const score = getAttemptScore(attempt);
    const lostGrade = score !== null ? ` (nota ${formatNumber(score, country)})` : '';
    const confirmed = await showConfirmation(
      `¿Habilitar otro intento a ${student.firstName}?`,
      `Para liberarle un intento se borra el último que hizo${lostGrade}. Recibirá un aviso para volver a presentarlo.`,
      'Habilitar intento',
      'warning',
    );
    if (!confirmed) return;

    try {
      await api.post(`/assessments/quiz/${attempt.assignmentGuid}/students/${student.guid}/new-attempt`);
      notify.success('Intento habilitado', `${student.firstName} ya puede volver a presentar el cuestionario.`);
      updateItems((rows) => withoutAttempt(rows, attempt.guid));
      onReleased();
    } catch (error) {
      showAlert.error('No se pudo habilitar el intento', errorMessage(error));
    }
  };
}
