'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAlerts } from '@/contexts/AlertContext';
import { useLeaveGuard } from './useLeaveGuard';

/**
 * Pide confirmación antes de salir de una edición sin guardar. Devuelve esa misma confirmación
 * para los botones de la pantalla que también descartan lo editado, como «Cancelar».
 */
export function useUnsavedChangesGuard(active: boolean): () => Promise<boolean> {
  const { showConfirmation } = useAlerts();
  const router = useRouter();

  const confirmDiscard = useCallback(
    () =>
      showConfirmation(
        'Cambios sin guardar',
        'Si sales ahora, se perderán los cambios que no has guardado.',
        'Salir sin guardar',
        'warning',
      ),
    [showConfirmation],
  );

  useLeaveGuard(active, {
    warning: 'Hay cambios sin guardar. ¿Salir igualmente?',
    onLeave: async (destination) => {
      if (await confirmDiscard()) router.push(destination);
    },
  });

  return confirmDiscard;
}
