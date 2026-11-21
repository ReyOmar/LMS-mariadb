'use client';

import { MessageSquare, Shield, UserPlus } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SearchInput } from '@/components/ui/SearchInput';
import { emptyContactsHint } from './inbox';
import { useMessenger, type SidePanel } from './useMessenger';
import { ContactList } from './components/ContactList';
import { RequestsPanel } from './components/RequestsPanel';
import { PeopleSearchPanel } from './components/PeopleSearchPanel';
import { ConversationView } from './components/ConversationView';

export default function MessagesPage() {
  const isAdmin = useSession().role === 'admin';
  const messenger = useMessenger();
  const { inbox, conversation, sidePanel, openContact } = messenger;

  if (inbox.loading) return <PageLoader message="Cargando mensajes…" />;
  if (inbox.error) return <LoadFailed message={inbox.error} onRetry={inbox.retry} />;

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
          <ListToolbar
            filter={messenger.filter}
            onFilter={messenger.setFilter}
            panel={sidePanel}
            onTogglePanel={messenger.togglePanel}
            pendingRequests={inbox.requests.length}
          />

          {sidePanel === 'requests' && inbox.requests.length > 0 && (
            <RequestsPanel
              requests={inbox.requests}
              isResponding={inbox.isResponding}
              onRespond={(requestId, accept) => void inbox.respond(requestId, accept)}
              onClose={messenger.closePanel}
            />
          )}

          {sidePanel === 'new-chat' && (
            <PeopleSearchPanel
              search={messenger.people}
              wholeSite={isAdmin}
              onWrite={messenger.startConversation}
              onClose={messenger.closePanel}
            />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <ContactList
              contacts={messenger.visibleContacts}
              openGuid={openContact?.guid ?? null}
              emptyHint={emptyContactsHint(messenger.filter.trim() !== '', isAdmin)}
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
              onClear={() => void messenger.clearConversation()}
              onSend={(content) => messenger.send(openContact, content)}
            />
          ) : (
            <NoConversationOpen wholeSite={isAdmin} />
          )}
        </section>
      </div>
    </div>
  );
}

/** Buscar entre las conversaciones, empezar una nueva y, si las hay, responder solicitudes. */
function ListToolbar({
  filter,
  onFilter,
  panel,
  onTogglePanel,
  pendingRequests,
}: {
  filter: string;
  onFilter: (text: string) => void;
  panel: SidePanel;
  onTogglePanel: (panel: SidePanel) => void;
  pendingRequests: number;
}) {
  return (
    <div className="p-4 border-b border-border/50 space-y-3">
      <SearchInput value={filter} onChange={onFilter} label="Buscar contacto" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onTogglePanel('new-chat')}
          aria-expanded={panel === 'new-chat'}
          className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="h-4 w-4" /> Nuevo contacto
        </button>
        {pendingRequests > 0 && (
          <button
            type="button"
            onClick={() => onTogglePanel('requests')}
            aria-expanded={panel === 'requests'}
            aria-label={`Solicitudes pendientes (${pendingRequests})`}
            title="Solicitudes pendientes"
            className="relative bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-amber-500/20 transition-colors"
          >
            <Shield className="h-4 w-4" />
            <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-amber-500 text-amber-950 text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingRequests}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function NoConversationOpen({ wholeSite }: { wholeSite: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-center p-6">
      <div>
        <MessageSquare className="h-14 w-14 mx-auto mb-4 opacity-10" />
        <p className="font-medium">Selecciona una conversación</p>
        <p className="text-sm mt-1">
          {wholeSite
            ? 'o busca a una persona de tu sede para comenzar.'
            : 'o busca un contacto en tus cursos para comenzar.'}
        </p>
      </div>
    </div>
  );
}
