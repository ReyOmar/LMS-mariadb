'use client';

import { useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { ExaminerSubmission } from '../../types';

type UpdateItems = (change: (items: ExaminerSubmission[]) => ExaminerSubmission[]) => void;

/** La entrega abierta para calificar y el guardado de su nota. */
export function useGrading(updateItems: UpdateItems, onGraded: () => void) {
  const { showAlert, notify } = useAlerts();
  const [openGuid, setOpenGuid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (guid: string, score: number, feedback: string) => {
    setSaving(true);
    try {
      const comment = feedback.trim() || null;
      await api.patch(`/assessments/submissions/${guid}/grade`, { score, feedback: comment ?? undefined });
      // Recargar la lista movería el acordeón bajo el ratón: la fila se refleja aquí.
      updateItems((items) =>
        items.map((item) => (item.guid === guid ? { ...item, status: 'GRADED', score, feedback: comment } : item)),
      );
      onGraded();
      setOpenGuid(null);
      notify.success('La nota ha sido guardada y el estudiante notificado.');
    } catch (error) {
      showAlert.error('No se pudo guardar la nota', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return { openGuid, saving, open: setOpenGuid, close: () => setOpenGuid(null), save };
}
