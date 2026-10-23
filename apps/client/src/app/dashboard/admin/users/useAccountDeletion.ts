'use client';

import { useRef, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { User } from '@/types/models';
import { deleteAccountWarning, type TransferState, type TransferTarget } from './components/accounts';

/**
 * Borrado de cuentas. Quien tiene cursos a su cargo no se borra sin elegir antes a quién pasan;
 * la respuesta de destinos que llega con el traspaso ya cancelado se descarta.
 */
export function useAccountDeletion(currentUserGuid: string | undefined, onDeleted: (guid: string) => void) {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const transferRequest = useRef<string | null>(null);
  const deleting = useRef(false);

  const closeTransfer = () => {
    transferRequest.current = null;
    setTransfer(null);
  };

  const deleteAccount = async (guid: string, courseTarget?: string) => {
    if (deleting.current) return;
    deleting.current = true;
    try {
      await api.delete(`/auth/users/${encodeURIComponent(guid)}`, {
        params: courseTarget ? { courseTarget } : undefined,
      });
      notify.success('Cuenta eliminada.');
      closeTransfer();
      onDeleted(guid);
    } catch (error) {
      showAlert.error('No se pudo eliminar', errorMessage(error));
    } finally {
      deleting.current = false;
    }
  };

  const openTransfer = async (user: User) => {
    transferRequest.current = user.guid;
    setTransfer({ user, targets: [], selectedTarget: '', loading: true });
    try {
      const { data } = await api.get<TransferTarget[]>(`/auth/users/${encodeURIComponent(user.guid)}/course-targets`);
      if (transferRequest.current !== user.guid) return;
      setTransfer({ user, targets: Array.isArray(data) ? data : [], selectedTarget: '', loading: false });
    } catch (error) {
      if (transferRequest.current !== user.guid) return;
      closeTransfer();
      showAlert.error('No se pudo preparar la eliminación', errorMessage(error));
    }
  };

  /** Cursos a su cargo ahora mismo: la fila de la lista puede ser de antes de que le asignaran uno. */
  const currentCourses = async (user: User): Promise<number> => {
    if (user.role === 'STUDENT') return 0;
    const { data } = await api.get<unknown[]>(`/courses/user/${encodeURIComponent(user.guid)}`);
    return data.length;
  };

  const requestDelete = async (user: User) => {
    if (user.guid === currentUserGuid) {
      showAlert.warning('Operación no permitida', 'No puedes eliminar tu propia cuenta.');
      return;
    }

    let taughtCourses: number;
    try {
      taughtCourses = await currentCourses(user);
    } catch (error) {
      showAlert.error('No se pudo preparar la eliminación', errorMessage(error));
      return;
    }
    if (taughtCourses > 0) {
      await openTransfer({ ...user, taughtCourses });
      return;
    }
    const confirmed = await showConfirmation(
      `¿Eliminar la cuenta de ${user.firstName} ${user.lastName}?`,
      deleteAccountWarning(user.role),
    );
    if (confirmed) await deleteAccount(user.guid);
  };

  return {
    transfer,
    requestDelete,
    pickTarget: (guid: string) => setTransfer((current) => (current ? { ...current, selectedTarget: guid } : current)),
    cancelTransfer: closeTransfer,
    confirmTransfer: () => (transfer ? deleteAccount(transfer.user.guid, transfer.selectedTarget) : undefined),
  };
}
