'use client';

import { useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import { useLiveData } from '@/hooks/useLiveData';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { IntegrationClient, IssuedIntegrationKey, WaitingCourse, WaitingRequest } from '@/types/models';

/** Lo que espera cambia por su cuenta: llega una solicitud, se publica un curso, pasa la tarea horaria. */
const WAITING_EVENTS: readonly RealtimeEvent[] = ['integration:changed'];
/** Los sistemas conectados sólo cambian desde esta pantalla. */
const NO_EVENTS: readonly RealtimeEvent[] = [];

async function fetchClients(): Promise<IntegrationClient[]> {
  return (await api.get<IntegrationClient[]>('/integration/clients')).data;
}

async function fetchWaiting(): Promise<WaitingCourse[]> {
  return (await api.get<WaitingCourse[]>('/integration/waiting')).data;
}

/** Sistemas conectados a la sede, sus claves y las matrículas que esperan un curso. */
export function useIntegrations() {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const clients = useLiveData(fetchClients, 'No se pudieron cargar los sistemas conectados.', NO_EVENTS);
  const waiting = useLiveData(fetchWaiting, 'No se pudieron cargar las matrículas en espera.', WAITING_EVENTS);
  const busy = useInFlight<string>();
  /** La clave recién generada: se enseña una vez y se olvida al cerrar el aviso. */
  const [issued, setIssued] = useState<IssuedIntegrationKey | null>(null);

  /** @returns Si se generó la clave. */
  const issue = async (key: string, request: () => Promise<IssuedIntegrationKey>) => {
    let generated = false;
    await busy.run(key, async () => {
      try {
        setIssued(await request());
        generated = true;
        await clients.refresh();
      } catch (error) {
        showAlert.error('No se pudo generar la clave', errorMessage(error));
      }
    });
    return generated;
  };

  /** @returns Si el sistema quedó conectado, para vaciar el formulario. */
  const connect = (name: string) =>
    issue('connect', async () => (await api.post<IssuedIntegrationKey>('/integration/clients', { name })).data);

  const renewKey = async (client: IntegrationClient) => {
    const confirmed = await showConfirmation(
      `¿Generar una clave nueva para «${client.name}»?`,
      client.keyPrefix
        ? 'La clave actual dejará de funcionar en el acto: el sistema tendrá que usar la nueva.'
        : 'El sistema volverá a poder pedir matrículas con la clave nueva.',
      'Generar clave',
      'warning',
    );
    if (!confirmed) return;
    await issue(
      `client-${client.id}`,
      async () => (await api.post<IssuedIntegrationKey>(`/integration/clients/${client.id}/key`)).data,
    );
  };

  const revokeKey = async (client: IntegrationClient) => {
    const confirmed = await showConfirmation(
      `¿Desconectar «${client.name}»?`,
      'Su clave dejará de funcionar y no podrá pedir más matrículas. Lo que ya pidió se conserva y sigue su curso.',
      'Desconectar',
      'danger',
    );
    if (!confirmed) return;
    await busy.run(`client-${client.id}`, async () => {
      try {
        const { data } = await api.delete<IntegrationClient>(`/integration/clients/${client.id}/key`);
        clients.update((list) => list.map((item) => (item.id === data.id ? data : item)));
        notify.success('Sistema desconectado.');
      } catch (error) {
        showAlert.error('No se pudo desconectar', errorMessage(error));
      }
    });
  };

  const discard = async (course: WaitingCourse, request: WaitingRequest) => {
    const confirmed = await showConfirmation(
      `¿Descartar la solicitud de ${request.firstName} ${request.lastName}?`,
      `Dejará de esperar el curso ${course.courseCode}. El sistema que la envió la verá como rechazada.`,
      'Descartar',
      'danger',
    );
    if (!confirmed) return;
    await busy.run(request.guid, async () => {
      try {
        await api.delete(`/integration/requests/${request.guid}`);
        await waiting.refresh();
        notify.success('Solicitud descartada.');
      } catch (error) {
        showAlert.error('No se pudo descartar', errorMessage(error));
      }
    });
  };

  return {
    clients,
    waiting,
    issued,
    closeIssued: () => setIssued(null),
    connect,
    renewKey,
    revokeKey,
    discard,
    isBusy: busy.has,
  };
}
