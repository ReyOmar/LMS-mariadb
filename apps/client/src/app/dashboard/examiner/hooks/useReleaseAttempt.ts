'use client';

import api, { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/country';
import { useAlerts } from '@/contexts/AlertContext';
import { useCountry } from '@/contexts/CountryContext';

/** Lo que hace falta para devolverle un intento a un alumno que agotó los de un cuestionario. */
export interface AttemptToRelease {
  resourceGuid: string;
  student: { guid: string; firstName: string };
  /** Nota del intento que se retira, para decir qué se pierde. `null` si no la tiene. */
  score: number | null;
}

/**
 * «Habilitar otro intento»: el servidor libera uno retirando el último, así que antes se confirma
 * diciendo qué nota se pierde. La usan «Monitoreo de pruebas» y «Hoy» del examinador.
 *
 * @returns Una función que resuelve `true` si el intento quedó habilitado.
 */
export function useReleaseAttempt() {
  const { notify, showAlert, showConfirmation } = useAlerts();
  const { country } = useCountry();

  return async ({ resourceGuid, student, score }: AttemptToRelease): Promise<boolean> => {
    const lostGrade = score !== null ? ` (nota ${formatNumber(score, country)})` : '';
    const confirmed = await showConfirmation(
      `¿Habilitar otro intento a ${student.firstName}?`,
      `Para liberarle un intento se borra el último que hizo${lostGrade}. Recibirá un aviso para volver a presentarlo.`,
      'Habilitar intento',
      'warning',
    );
    if (!confirmed) return false;

    try {
      await api.post(`/assessments/quiz/${resourceGuid}/students/${student.guid}/new-attempt`);
      notify.success('Intento habilitado', `${student.firstName} ya puede volver a presentar el cuestionario.`);
      return true;
    } catch (error) {
      showAlert.error('No se pudo habilitar el intento', errorMessage(error));
      return false;
    }
  };
}
