'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useInFlight } from '@/hooks/useInFlight';
import { USER_ROLE_LABEL } from '@/lib/labels';
import type { AccessRequest } from '@/types/models';

type Decision = 'approve' | 'reject';

const DECISION_NOTICE: Record<Decision, [title: string, message: string]> = {
  approve: ['Solicitud aprobada', 'La cuenta se creó y la persona recibirá un correo con su contraseña temporal.'],
  reject: ['Solicitud rechazada', 'La persona recibirá un correo con la decisión.'],
};

export function useAccessRequests() {
  const { showAlert, showConfirmation } = useAlerts();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processing = useInFlight<number>();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AccessRequest[]>('/auth/access-requests');
      setRequests(Array.isArray(data) ? data : []);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudieron cargar las solicitudes.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvent('request:new', () => void load());
  useRealtimeEvent('request:resolved', () => void load());
  useRealtimeReconnect(() => void load());

  const resolve = (request: AccessRequest, decision: Decision, reason?: string) =>
    processing.run(request.id, async () => {
      try {
        await api.post(`/auth/access-requests/${request.id}/${decision}`, reason ? { reason } : {});
        setRequests((pending) => pending.filter((item) => item.id !== request.id));
        showAlert.success(...DECISION_NOTICE[decision]);
      } catch (failure) {
        showAlert.error('No se pudo procesar', errorMessage(failure));
      }
    });

  /** Aprobar crea la cuenta y envía la contraseña: no se deshace, así que se confirma. */
  const approve = async (request: AccessRequest) => {
    const confirmed = await showConfirmation(
      `¿Aprobar la solicitud de ${request.firstName} ${request.lastName}?`,
      `Se creará su cuenta de ${USER_ROLE_LABEL[request.requestedRole].toLowerCase()} y recibirá por correo una contraseña temporal.`,
      'Aprobar',
      'info',
    );
    if (confirmed) await resolve(request, 'approve');
  };

  const retry = () => {
    setLoading(true);
    void load();
  };

  return {
    requests,
    loading,
    error,
    retry,
    isProcessing: processing.has,
    approve,
    reject: (request: AccessRequest, reason: string) => resolve(request, 'reject', reason),
  };
}
