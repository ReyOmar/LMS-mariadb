'use client';

import { useCallback, useRef, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useCurrentList } from '@/hooks/useCurrentList';
import type { Contact, Message } from '@/types/models';
import { appendMessage, mergeConversation, receivedMessage, sentMessage, type IncomingMessage } from './inbox';

/** El campo `subject` es obligatorio en la API; en el chat no se escribe asunto. */
const MESSAGE_SUBJECT = 'Mensaje';

/**
 * La conversación abierta. Lo que llega tarde de otra conversación (su carga, un envío que
 * terminó después de cambiar) no se mezcla con la que está a la vista.
 *
 * @param onRead Memorizada: avisa de que la conversación con ese contacto quedó leída.
 */
export function useConversation(onRead: (contactGuid: string) => void) {
  const { notify, showAlert, showConfirmation } = useAlerts();
  const loads = useCurrentList();
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const openGuid = useRef<string | null>(null);

  const markRead = useCallback(
    (contactGuid: string) =>
      api
        .patch(`/notifications/messages/${contactGuid}/read`)
        .then(() => onRead(contactGuid))
        .catch(() => undefined),
    [onRead],
  );

  const load = useCallback(
    async (target: Contact) => {
      const isCurrent = loads.start();
      try {
        const { data } = await api.get<Message[]>(`/notifications/messages/${target.guid}`);
        if (!isCurrent()) return;
        setMessages((shown) => mergeConversation(data, shown));
        void markRead(target.guid);
      } catch (failure) {
        if (isCurrent()) notify.error('No se pudieron cargar los mensajes', errorMessage(failure));
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [loads, markRead, notify],
  );

  const open = (target: Contact) => {
    openGuid.current = target.guid;
    setContact(target);
    setMessages([]);
    setLoading(true);
    void load(target);
  };

  const close = () => {
    loads.start();
    openGuid.current = null;
    setContact(null);
    setMessages([]);
    setLoading(false);
  };

  // Lo que se escribió mientras el tiempo real estaba cortado no llegó como aviso.
  useRealtimeReconnect(() => {
    if (contact) void load(contact);
  });

  /** Un mensaje de la persona con quien se está hablando: se ve al momento y queda leído. */
  const receive = (incoming: IncomingMessage) => {
    setMessages((current) => appendMessage(current, receivedMessage(incoming)));
    void markRead(incoming.senderGuid);
  };

  /** Devuelve el mensaje guardado, o `null` si no se pudo enviar (ya avisado). */
  const send = async (target: Contact, content: string): Promise<Message | null> => {
    try {
      const { data } = await api.post<Omit<Message, 'isMine'>>('/notifications/messages', {
        recipientGuid: target.guid,
        subject: MESSAGE_SUBJECT,
        content,
      });
      const message = sentMessage(data);
      if (openGuid.current === target.guid) setMessages((current) => appendMessage(current, message));
      return message;
    } catch (failure) {
      showAlert.error('No se pudo enviar el mensaje', errorMessage(failure));
      return null;
    }
  };

  /** Vacía la conversación de la propia bandeja; la otra persona conserva la suya. Devuelve si se hizo. */
  const clear = async (): Promise<boolean> => {
    if (!contact) return false;
    const confirmed = await showConfirmation(
      'Vaciar conversación',
      `Se eliminará de tu bandeja la conversación con ${contact.firstName}. ` +
        'La otra persona conservará su copia y podrán seguir escribiéndose. No se puede deshacer.',
      'Vaciar',
    );
    if (!confirmed) return false;

    try {
      await api.delete(`/notifications/messages/${contact.guid}`);
      close();
      notify.success('Conversación vaciada de tu bandeja.');
      return true;
    } catch (failure) {
      showAlert.error('No se pudo vaciar la conversación', errorMessage(failure));
      return false;
    }
  };

  return { contact, messages, loading, open, close, receive, send, clear };
}
