'use client';

import { useCallback } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useInFlight } from '@/hooks/useInFlight';
import { useLiveData } from '@/hooks/useLiveData';
import type { Contact, Message } from '@/types/models';
import { withConversationRead, withLatestMessage, type ContactRequest, type IncomingMessage } from './inbox';

const INBOX_EVENTS = ['contact:updated'] as const;

async function fetchContacts(): Promise<Contact[]> {
  const { data } = await api.get<Contact[]>('/notifications/messages/contacts');
  return data;
}

async function fetchRequests(): Promise<ContactRequest[]> {
  const { data } = await api.get<ContactRequest[]>('/notifications/messages/requests');
  return data;
}

/** Las conversaciones del usuario y las solicitudes de contacto que ha recibido. */
export function useInbox() {
  const { showAlert } = useAlerts();
  const responding = useInFlight<number>();
  const contacts = useLiveData(fetchContacts, 'No se pudieron cargar tus conversaciones.', INBOX_EVENTS);
  // Las solicitudes son complementarias: si no llegan, la bandeja sigue siendo usable sin ellas.
  const requests = useLiveData(fetchRequests, 'No se pudieron cargar las solicitudes.', INBOX_EVENTS);
  const { update: updateContacts, refresh: refreshContacts } = contacts;

  const markRead = useCallback(
    (contactGuid: string) => updateContacts((current) => withConversationRead(current, contactGuid)),
    [updateContacts],
  );

  // Leída desde otra pestaña o dispositivo.
  useRealtimeEvent('message:read', (data) => {
    const { contactGuid } = data as { contactGuid?: string };
    if (contactGuid) markRead(contactGuid);
  });

  /** Un mensaje de alguien que ya está en la lista se pinta sin volver a pedirla. */
  const receive = (incoming: IncomingMessage, alreadyRead: boolean) => {
    const sender = contacts.data?.find((contact) => contact.guid === incoming.senderGuid);
    if (sender) updateContacts((current) => withLatestMessage(current, sender, incoming, alreadyRead ? 0 : 1));
    else void refreshContacts();
  };

  const recordSent = (contact: Contact, message: Message) =>
    updateContacts((current) => withLatestMessage(current, contact, message, 0));

  const respond = (requestId: number, accept: boolean) =>
    responding.run(requestId, async () => {
      try {
        await api.patch(`/notifications/messages/requests/${requestId}`, { accept });
        requests.update((current) => current.filter((request) => request.id !== requestId));
        if (accept) void refreshContacts();
      } catch (failure) {
        showAlert.error('No se pudo responder a la solicitud', errorMessage(failure));
      }
    });

  return {
    contacts: contacts.data ?? [],
    requests: requests.data ?? [],
    loading: contacts.loading,
    error: contacts.error,
    retry: contacts.retry,
    refreshContacts,
    markRead,
    receive,
    recordSent,
    respond,
    isResponding: responding.has,
  };
}
