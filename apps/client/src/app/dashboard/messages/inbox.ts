import type { Contact, Message, UserRole } from '@/types/models';

/** Largo máximo de un mensaje; el mismo que admite el servidor. */
export const MAX_MESSAGE_LENGTH = 5000;

/** Lo que trae `message:new`: un mensaje que acaba de escribir otra persona. */
export interface IncomingMessage {
  id: number;
  senderGuid: string;
  subject: string;
  content: string;
  createdAt: string;
}

/** Alguien con quien se puede empezar una conversación, o pedirle contacto antes. */
export interface ContactCandidate {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  contactStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  /** Se le puede escribir ya, sin pedir contacto antes. */
  canWrite: boolean;
}

/** Solicitud de contacto recibida. El solicitante es nulo si su cuenta ya no está en la sede. */
export interface ContactRequest {
  id: number;
  requester: { guid: string; firstName: string; lastName: string; role: UserRole } | null;
}

export function receivedMessage(incoming: IncomingMessage): Message {
  return { ...incoming, read: true, isMine: false };
}

export function sentMessage(saved: Omit<Message, 'isMine'>): Message {
  return { ...saved, isMine: true };
}

/** El mensaje se añade una sola vez aunque llegue por tiempo real y con la conversación. */
export function appendMessage(messages: Message[], message: Message): Message[] {
  return messages.some((existing) => existing.id === message.id) ? messages : [...messages, message];
}

/**
 * La conversación recién pedida, sin perder lo que llegó por tiempo real mientras se pedía: los
 * identificadores crecen con cada mensaje, así que lo posterior a lo recibido es más nuevo.
 */
export function mergeConversation(fetched: Message[], shown: Message[]): Message[] {
  const newestFetched = Math.max(0, ...fetched.map((message) => message.id));
  return [...fetched, ...shown.filter((message) => message.id > newestFetched)];
}

/**
 * La conversación con el último mensaje sube al principio de la lista. Se toma la versión del
 * contacto que ya está en la lista, para no perder lo que haya cambiado desde que se leyó.
 */
export function withLatestMessage(
  contacts: Contact[],
  contact: Contact,
  message: Pick<Message, 'content' | 'createdAt'>,
  unreadIncrement: 0 | 1,
): Contact[] {
  const listed = contacts.find((item) => item.guid === contact.guid) ?? contact;
  const updated: Contact = {
    ...listed,
    lastMessage: message.content,
    lastMessageAt: message.createdAt,
    unreadCount: listed.unreadCount + unreadIncrement,
  };
  return [updated, ...contacts.filter((item) => item.guid !== contact.guid)];
}

export function withConversationRead(contacts: Contact[], contactGuid: string): Contact[] {
  return contacts.map((contact) => (contact.guid === contactGuid ? { ...contact, unreadCount: 0 } : contact));
}

/** Una conversación nueva con alguien encontrado en la búsqueda, todavía sin mensajes. */
export function contactFromCandidate(candidate: ContactCandidate): Contact {
  return {
    guid: candidate.guid,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    role: candidate.role,
    lastMessage: '',
    lastMessageAt: null,
    unreadCount: 0,
    canWrite: true,
  };
}
