'use client';

import { useState } from 'react';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { matchesSearch } from '@/lib/text';
import type { Contact } from '@/types/models';
import { contactFromCandidate, type ContactCandidate, type IncomingMessage } from './inbox';
import { useInbox } from './useInbox';
import { useConversation } from './useConversation';
import { usePeopleSearch } from './usePeopleSearch';

/** Lo que se despliega sobre la lista: buscar a alguien nuevo o responder solicitudes. */
export type SidePanel = 'none' | 'new-chat' | 'requests';

/**
 * La mensajería de la página: la bandeja, la conversación abierta y la búsqueda de personas,
 * coordinadas entre sí y con lo que llega en tiempo real.
 */
export function useMessenger() {
  const inbox = useInbox();
  const conversation = useConversation(inbox.markRead);
  const [sidePanel, setSidePanel] = useState<SidePanel>('none');
  const people = usePeopleSearch(sidePanel === 'new-chat');
  const [filter, setFilter] = useState('');

  useRealtimeEvent('message:new', (data) => {
    const incoming = data as IncomingMessage;
    const inOpenConversation = conversation.contact?.guid === incoming.senderGuid;
    if (inOpenConversation) conversation.receive(incoming);
    inbox.receive(incoming, inOpenConversation);
  });
  // Una solicitud aceptada o recibida cambia lo que se puede hacer con cada persona encontrada.
  useRealtimeEvent('contact:updated', people.refresh);

  // La lista se refresca en vivo: lo que diga es más reciente que la copia de la conversación abierta.
  const openContact =
    conversation.contact &&
    (inbox.contacts.find((contact) => contact.guid === conversation.contact?.guid) ?? conversation.contact);
  const visibleContacts = inbox.contacts.filter((contact) =>
    matchesSearch(`${contact.firstName} ${contact.lastName}`, filter),
  );

  const togglePanel = (panel: SidePanel) => setSidePanel((current) => (current === panel ? 'none' : panel));
  const closePanel = () => setSidePanel('none');

  const startConversation = (candidate: ContactCandidate) => {
    closePanel();
    const listed = inbox.contacts.find((contact) => contact.guid === candidate.guid);
    conversation.open(listed ?? contactFromCandidate(candidate));
  };

  const send = async (target: Contact, content: string) => {
    const message = await conversation.send(target, content);
    if (message) inbox.recordSent(target, message);
    return message !== null;
  };

  const clearConversation = async () => {
    if (await conversation.clear()) void inbox.refreshContacts();
  };

  return {
    inbox,
    conversation,
    people,
    sidePanel,
    togglePanel,
    closePanel,
    filter,
    setFilter,
    openContact,
    visibleContacts,
    startConversation,
    send,
    clearConversation,
  };
}
