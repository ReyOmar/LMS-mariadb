'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, Check, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { shortTime } from '@/lib/dates';
import type { Contact, Message } from '@/types/models';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { MessageComposer } from './MessageComposer';

interface Props {
  contact: Contact;
  messages: Message[];
  loading: boolean;
  onBack: () => void;
  onClear: () => void;
  onSend: (content: string) => Promise<boolean>;
}

export function ConversationView({ contact, messages, loading, onBack, onClear, onSend }: Props) {
  return (
    <>
      <header className="h-16 px-3 sm:px-5 flex items-center gap-3 border-b border-border/50 shrink-0 bg-muted/10">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Volver a las conversaciones"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <UserAvatar person={contact} role={contact.role} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">
            {contact.firstName} {contact.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{USER_ROLE_LABEL[contact.role]}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-2 text-red-700 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Vaciar conversación de mi bandeja"
          aria-label="Vaciar conversación de mi bandeja"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <MessageList messages={messages} loading={loading} />

      {contact.canWrite ? (
        // Un borrador es de su conversación: al cambiar de persona no se arrastra.
        <MessageComposer key={contact.guid} onSend={onSend} />
      ) : (
        <p className="p-4 border-t border-border/50 shrink-0 text-xs text-muted-foreground text-center">
          Ya no puedes escribir a esta persona porque no comparten un curso activo. El historial sigue disponible.
        </p>
      )}
    </>
  );
}

function MessageList({ messages, loading }: { messages: Message[]; loading: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);

  // Lo último escrito es lo que se quiere leer. Se desplaza la lista, no la página.
  useEffect(() => {
    const list = scroller.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando mensajes" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-10" />
        <p className="text-sm">Envía el primer mensaje.</p>
      </div>
    );
  }

  return (
    <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4">
      <ol className="space-y-4">
        {messages.map((message) => (
          <li key={message.id} className={`flex ${message.isMine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${
                message.isMine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              <p
                className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                  message.isMine ? 'text-primary-foreground/70 justify-end' : 'text-muted-foreground'
                }`}
              >
                {shortTime(message.createdAt)}
                {message.isMine && <Check className="h-3 w-3" />}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
