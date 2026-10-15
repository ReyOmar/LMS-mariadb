import { Inbox } from 'lucide-react';
import { conversationTimestamp } from '@/lib/dates';
import type { Contact } from '@/types/models';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface Props {
  contacts: Contact[];
  openGuid: string | null;
  /** Qué hacer para empezar, cuando no hay ninguna conversación que mostrar. */
  emptyHint: string;
  onOpen: (contact: Contact) => void;
}

export function ContactList({ contacts, openGuid, emptyHint, onOpen }: Props) {
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
        <Inbox className="h-10 w-10 opacity-20 mb-3" />
        <p className="text-sm font-medium">Sin conversaciones</p>
        <p className="text-xs mt-1">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul>
      {contacts.map((contact) => (
        <li key={contact.guid}>
          <button
            type="button"
            onClick={() => onOpen(contact)}
            aria-current={contact.guid === openGuid ? 'true' : undefined}
            className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30 ${
              contact.guid === openGuid ? 'bg-primary/5 border-l-2 border-l-primary' : ''
            }`}
          >
            <UserAvatar person={contact} role={contact.role} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm truncate">
                  {contact.firstName} {contact.lastName}
                </p>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {conversationTimestamp(contact.lastMessageAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {contact.lastMessage || 'Envía el primer mensaje'}
              </p>
            </div>
            {contact.unreadCount > 0 && (
              <span
                aria-label={`${contact.unreadCount} sin leer`}
                className="bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shrink-0"
              >
                {contact.unreadCount}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
