'use client';

import { useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { plural } from '@/lib/text';
import { useInFlight } from '@/hooks/useInFlight';
import { useLiveData } from '@/hooks/useLiveData';
import type { RealtimeEvent } from '@/lib/realtime/events';
import type { CallbackTest, Infraction, IntegrationClient, IssuedIntegrationKey, WaitingRequest } from '@/types/models';
import type { CourseOption } from './components/Infractions';

/**
 * Las infracciones cambian por su cuenta —llega una solicitud, se publica un curso, pasa la tarea
 * horaria— y con su curso, que puede cambiar o borrarse en otra pantalla.
 */
const INFRACTION_EVENTS: readonly RealtimeEvent[] = ['integration:changed', 'course:updated', 'course:deleted'];
const COURSE_EVENTS: readonly RealtimeEvent[] = ['course:created', 'course:updated', 'course:deleted'];
/** Los sistemas conectados cambian aquí, al usarlos y cuando sus avisos empiezan o dejan de fallar. */
const CLIENT_EVENTS: readonly RealtimeEvent[] = ['integration:changed'];

async function fetchClients(): Promise<IntegrationClient[]> {
  return (await api.get<IntegrationClient[]>('/integration/clients')).data;
}

async function fetchInfractions(): Promise<Infraction[]> {
  return (await api.get<Infraction[]>('/integration/infractions')).data;
}

/** Los cursos de la sede que se pueden elegir para una infracción, por orden alfabético. */
async function fetchCourses(): Promise<CourseOption[]> {
  const { data } = await api.get<CourseOption[]>('/courses');
  return data
    .map(({ guid, title, status }) => ({ guid, title, status }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Sistemas conectados a la sede, sus claves y a dónde se les avisa, y las infracciones que llegan con
 * el curso que atiende cada una.
 */
export function useIntegrations() {
  const { showAlert, showConfirmation, notify } = useAlerts();
  const clients = useLiveData(fetchClients, 'No se pudieron cargar los sistemas conectados.', CLIENT_EVENTS);
  const infractions = useLiveData(fetchInfractions, 'No se pudieron cargar las infracciones.', INFRACTION_EVENTS);
  const courses = useLiveData(fetchCourses, 'No se pudieron cargar los cursos de la sede.', COURSE_EVENTS);
  const busy = useInFlight<string>();
  /** La clave recién generada: se enseña una vez y se olvida al cerrar el aviso. */
  const [issued, setIssued] = useState<IssuedIntegrationKey | null>(null);
  /** El sistema cuya dirección de avisos se está editando. */
  const [callbackOf, setCallbackOf] = useState<IntegrationClient | null>(null);

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

  const removeClient = async (client: IntegrationClient) => {
    const requests = client._count.requests;
    const confirmed = await showConfirmation(
      `¿Eliminar «${client.name}»?`,
      requests === 0
        ? 'Desaparecerá de la lista. No ha enviado ninguna solicitud.'
        : `Se borrará el registro de sus ${requests} ${plural(requests, 'solicitud', 'solicitudes')}. Quienes ya matriculó conservan su matrícula y sus certificados; las que aún esperaban un curso dejarán de esperar. No se puede deshacer.`,
      'Eliminar',
      'danger',
    );
    if (!confirmed) return;
    await busy.run(`client-${client.id}`, async () => {
      try {
        await api.delete(`/integration/clients/${client.id}`);
        clients.update((list) => list.filter((item) => item.id !== client.id));
        notify.success('Sistema eliminado.');
      } catch (error) {
        showAlert.error('No se pudo eliminar', errorMessage(error));
      }
    });
  };

  /** Guarda la dirección de avisos del sistema, o la quita si es `null`. */
  const saveCallback = (client: IntegrationClient, url: string | null) =>
    busy.run(`client-${client.id}`, async () => {
      try {
        const { data } = await api.put<IntegrationClient>(`/integration/clients/${client.id}/callback`, { url });
        clients.update((list) => list.map((item) => (item.id === data.id ? data : item)));
        setCallbackOf((open) => (open?.id === data.id ? data : open));
        notify.success(url ? 'Dirección guardada: envía un aviso de prueba para comprobarla.' : 'Ya no se le avisará.');
      } catch (error) {
        showAlert.error('No se pudo guardar la dirección', errorMessage(error));
      }
    });

  const testCallback = async (client: IntegrationClient): Promise<CallbackTest | null> => {
    let result: CallbackTest | null = null;
    await busy.run(`client-${client.id}`, async () => {
      try {
        result = (await api.post<CallbackTest>(`/integration/clients/${client.id}/callback/test`)).data;
        await clients.refresh();
      } catch (error) {
        showAlert.error('No se pudo enviar el aviso de prueba', errorMessage(error));
      }
    });
    return result;
  };

  /** Elige el curso de una infracción: se matriculan en él quienes esperaban y quienes lleguen después. */
  const assignCourse = async (infraction: Infraction, course: CourseOption) => {
    const waiting = infraction.waiting.length;
    const who = waiting === 1 ? 'La persona que espera entrará' : `Las ${waiting} personas que esperan entrarán`;
    const when = course.status === 'PUBLISHED' ? 'ahora' : 'en cuanto lo publiques';
    const confirmed = await showConfirmation(
      `¿Atender la infracción ${infraction.code} con «${course.title}»?`,
      `Cada solicitud que llegue por esta infracción se matriculará en este curso.${waiting > 0 ? ` ${who} ${when}.` : ''}`,
      'Elegir este curso',
      'info',
    );
    if (!confirmed) return;
    await busy.run(`infraction-${infraction.id}`, async () => {
      try {
        const { data } = await api.put<{ message: string }>(`/integration/infractions/${infraction.id}/course`, {
          courseGuid: course.guid,
        });
        await infractions.refresh();
        notify.success(data.message);
      } catch (error) {
        showAlert.error('No se pudo elegir el curso', errorMessage(error));
      }
    });
  };

  const discard = async (infraction: Infraction, request: WaitingRequest) => {
    const confirmed = await showConfirmation(
      `¿Descartar la solicitud de ${request.firstName} ${request.lastName}?`,
      `Dejará de esperar por la infracción ${infraction.code}. El sistema que la envió la verá como rechazada.`,
      'Descartar',
      'danger',
    );
    if (!confirmed) return;
    await busy.run(request.guid, async () => {
      try {
        await api.delete(`/integration/requests/${request.guid}`);
        await infractions.refresh();
        notify.success('Solicitud descartada.');
      } catch (error) {
        showAlert.error('No se pudo descartar', errorMessage(error));
      }
    });
  };

  return {
    clients,
    infractions,
    courses,
    issued,
    closeIssued: () => setIssued(null),
    callbackOf,
    editCallback: setCallbackOf,
    closeCallback: () => setCallbackOf(null),
    saveCallback,
    testCallback,
    connect,
    renewKey,
    revokeKey,
    removeClient,
    assignCourse,
    discard,
    isBusy: busy.has,
  };
}
