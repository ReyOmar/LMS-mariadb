'use client';

import { useRef } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { User } from '@/types/models';

/** Envía otra contraseña temporal a quien todavía no ha entrado: la primera pudo no llegarle. */
export function useTemporaryPassword() {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const sending = useRef(false);

  return async (user: User) => {
    if (sending.current) return;
    const confirmed = await showConfirmation(
      'Enviar una contraseña temporal nueva',
      `Se enviará a ${user.email} y la que tenía dejará de valer.`,
      'Enviar',
      'warning',
    );
    if (!confirmed) return;

    sending.current = true;
    try {
      const { data } = await api.post<{ message: string }>(
        `/auth/users/${encodeURIComponent(user.guid)}/temporary-password`,
      );
      notify.success(data.message);
    } catch (error) {
      showAlert.error('No se pudo enviar la contraseña', errorMessage(error));
    } finally {
      sending.current = false;
    }
  };
}
