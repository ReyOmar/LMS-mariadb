'use client';

import { useState } from 'react';
import { MessageSquare, Shield, UserPlus } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { matchesSearch } from '@/lib/text';
import type { Contact } from '@/types/models';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SearchInput } from '@/components/ui/SearchInput';
import { contactFromCandidate, type ContactCandidate, type IncomingMessage } from './inbox';
import { useInbox } from './useInbox';
import { useConversation } from './useConversation';
import { usePeopleSearch } from './usePeopleSearch';
import { ContactList } from './components/ContactList';
import { RequestsPanel } from './components/RequestsPanel';
import { PeopleSearchPanel } from './components/PeopleSearchPanel';
import { ConversationView } from './components/ConversationView';

type SidePanel = 'none' | 'new-chat' | 'requests';

export default function MessagesPage() {
  const isAdmin = useSession().role === 'admin';
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

  if (inbox.loading) return <PageLoader message="Cargando mensajes…" />;
  if (inbox.error) return <LoadFailed message={inbox.error} onRetry={inbox.retry} />;

  // La lista se refresca en vivo: lo que diga es más reciente que la copia de la conversación abierta.
  const openContact =
    conversation.contact &&
    (inbox.contacts.find((contact) => contact.guid === conversation.contact?.guid) ?? conversation.contact);
  const visibleContacts = inbox.contacts.filter((contact) =>
    matchesSearch(`${contact.firstName} ${contact.lastName}`, filter),
  );

  const togglePanel = (panel: SidePanel) => setSidePanel((current) => (current === panel ? 'none' : panel));

  const startConversation = (candidate: ContactCandidate) => {
    setSidePanel('none');
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

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100dvh-5rem)] lg:h-[calc(100dvh-4rem)] flex flex-col">
      <header className="mb-4 sm:mb-6 shrink-0">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mensajes
        </h1>
        <p className="text-muted-foreground mt-1.5">
          {isAdmin
            ? 'Comunicación con las personas de tu sede.'
            : 'Comunicación exclusiva entre participantes del curso.'}
        </p>
      </header>

      <div className="flex flex-1 min-h-0 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <aside
          aria-label="Conversaciones"
          className={`w-full md:w-[340px] border-r border-border flex-col shrink-0 ${openContact ? 'hidden md:flex' : 'flex'}`}
        >
          <div className="p-4 border-b border-border/50 space-y-3">
            <SearchInput value={filter} onChange={setFilter} label="Buscar contacto" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => togglePanel('new-chat')}
                aria-expanded={sidePanel === 'new-chat'}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" /> Nuevo contacto
              </button>
              {inbox.requests.length > 0 && (
                <button
                  type="button"
                  onClick={() => togglePanel('requests')}
                  aria-expanded={sidePanel === 'requests'}
                  aria-label={`Solicitudes pendientes (${inbox.requests.length})`}
                  title="Solicitudes pendientes"
                  className="relative bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-amber-500/20 transition-colors"
                >
                  <Shield className="h-4 w-4" />
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-amber-500 text-amber-950 text-[10px] font-bold rounded-full flex items-center justify-center">
                    {inbox.requests.length}
                  </span>
                </button>
              )}
            </div>
          </div>

          {sidePanel === 'requests' && inbox.requests.length > 0 && (
            <RequestsPanel
              requests={inbox.requests}
              isResponding={inbox.isResponding}
              onRespond={(requestId, accept) => void inbox.respond(requestId, accept)}
              onClose={() => setSidePanel('none')}
            />
          )}

          {sidePanel === 'new-chat' && (
            <PeopleSearchPanel
              search={people}
              wholeSite={isAdmin}
              onWrite={startConversation}
              onClose={() => setSidePanel('none')}
            />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <ContactList
              contacts={visibleContacts}
              openGuid={openContact?.guid ?? null}
              emptyHint={
                filter.trim()
                  ? 'Ninguna conversación coincide con la búsqueda.'
                  : isAdmin
                    ? 'Busca a una persona de tu sede para iniciar una conversación.'
                    : 'Busca un compañero o examinador de tu curso para iniciar una conversación.'
              }
              onOpen={conversation.open}
            />
          </div>
        </aside>

        <section
          aria-label="Conversación"
          className={`flex-1 min-w-0 flex-col ${openContact ? 'flex' : 'hidden md:flex'}`}
        >
          {openContact ? (
            <ConversationView
              contact={openContact}
              messages={conversation.messages}
              loading={conversation.loading}
              onBack={conversation.close}
              onClear={() => void clearConversation()}
              onSend={(content) => send(openContact, content)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center p-6">
              <div>
                <MessageSquare className="h-14 w-14 mx-auto mb-4 opacity-10" />
                <p className="font-medium">Selecciona una conversación</p>
                <p className="text-sm mt-1">
                  {isAdmin
                    ? 'o busca a una persona de tu sede para comenzar.'
                    : 'o busca un contacto en tus cursos para comenzar.'}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
