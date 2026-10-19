'use client';

import { useState } from 'react';
import { isAxiosError } from 'axios';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { ExaminerSubmission } from '../../types';

type UpdateItems = (change: (items: ExaminerSubmission[]) => ExaminerSubmission[]) => void;

/** La entrega abierta y la versión que el examinador tiene delante: la nota es de esa versión. */
type Reviewing = Pick<ExaminerSubmission, 'guid' | 'submittedAt'>;

/** La entrega abierta para calificar y el guardado de su nota. */
export function useGrading(updateItems: UpdateItems, onGraded: () => void) {
  const { showAlert, notify } = useAlerts();
  const [reviewing, setReviewing] = useState<Reviewing | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (score: number, feedback: string) => {
    if (!reviewing) return;
    const { guid, submittedAt } = reviewing;
    setSaving(true);
    try {
      const comment = feedback.trim() || null;
      await api.patch(`/assessments/submissions/${guid}/grade`, {
        score,
        feedback: comment ?? undefined,
        submittedAt,
      });
      // Recargar la lista movería el acordeón bajo el ratón: la fila se refleja aquí.
      updateItems((items) =>
        items.map((item) => (item.guid === guid ? { ...item, status: 'GRADED', score, feedback: comment } : item)),
      );
      onGraded();
      setReviewing(null);
      notify.success('La nota ha sido guardada y el estudiante notificado.');
    } catch (error) {
      // El alumno envió otra versión: la abierta ya no es la que se calificaría.
      if (isAxiosError(error) && error.response?.status === 409) setReviewing(null);
      showAlert.error('No se pudo guardar la nota', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return {
    openGuid: reviewing?.guid ?? null,
    saving,
    open: ({ guid, submittedAt }: ExaminerSubmission) => setReviewing({ guid, submittedAt }),
    close: () => setReviewing(null),
    save,
  };
}
