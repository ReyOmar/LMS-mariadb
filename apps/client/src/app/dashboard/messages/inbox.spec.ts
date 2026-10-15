import type { Contact, Message } from '@/types/models';
import {
  appendMessage,
  contactFromCandidate,
  mergeConversation,
  receivedMessage,
  sentMessage,
  withConversationRead,
  withLatestMessage,
} from './inbox';

function contact(guid: string, unreadCount = 0): Contact {
  return {
    guid,
    firstName: guid,
    lastName: 'Pérez',
    role: 'STUDENT',
    lastMessage: 'antes',
    lastMessageAt: '2026-10-01T10:00:00Z',
    unreadCount,
    canWrite: true,
  };
}

const message = (id: number): Message => ({
  id,
  senderGuid: 'ana',
  subject: 'Mensaje',
  content: `mensaje ${id}`,
  read: true,
  createdAt: '2026-10-02T10:00:00Z',
  isMine: false,
});

describe('appendMessage', () => {
  it('añade el mensaje al final', () => {
    expect(appendMessage([message(1)], message(2)).map((item) => item.id)).toEqual([1, 2]);
  });

  it('no lo repite si ya llegó con la conversación', () => {
    const messages = [message(1), message(2)];
    expect(appendMessage(messages, message(2))).toBe(messages);
  });
});

describe('mergeConversation', () => {
  it('conserva lo que llegó por tiempo real mientras se pedía la conversación', () => {
    const merged = mergeConversation([message(1), message(2)], [message(3)]);
    expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('no duplica lo que ya trae la conversación ni recupera lo que quedó fuera de ella', () => {
    const merged = mergeConversation([message(5), message(6)], [message(1), message(6)]);
    expect(merged.map((item) => item.id)).toEqual([5, 6]);
  });
});

describe('receivedMessage y sentMessage', () => {
  it('lo recibido con la conversación abierta queda leído y es de la otra persona', () => {
    const incoming = {
      id: 7,
      senderGuid: 'ana',
      subject: 'Mensaje',
      content: 'hola',
      createdAt: '2026-10-02T10:00:00Z',
    };
    expect(receivedMessage(incoming)).toMatchObject({ id: 7, read: true, isMine: false });
  });

  it('lo enviado conserva el identificador y la hora del servidor', () => {
    const { isMine: _isMine, ...saved } = message(9);
    expect(sentMessage(saved)).toMatchObject({ id: 9, createdAt: saved.createdAt, isMine: true });
  });
});

describe('withLatestMessage', () => {
  const latest = { content: 'nuevo', createdAt: '2026-10-03T10:00:00Z' };

  it('sube la conversación al principio con el último mensaje', () => {
    const updated = withLatestMessage([contact('ana'), contact('luis')], contact('luis'), latest, 0);
    expect(updated.map((item) => item.guid)).toEqual(['luis', 'ana']);
    expect(updated[0]).toMatchObject({ lastMessage: 'nuevo', lastMessageAt: latest.createdAt });
  });

  it('cuenta como pendiente lo que llega con la conversación cerrada', () => {
    const contacts = [contact('ana', 2)];
    expect(withLatestMessage(contacts, contact('ana'), latest, 1)[0].unreadCount).toBe(3);
    expect(withLatestMessage(contacts, contact('ana'), latest, 0)[0].unreadCount).toBe(2);
  });

  it('una conversación nueva entra en la lista', () => {
    const updated = withLatestMessage([contact('ana')], contact('eva'), latest, 0);
    expect(updated.map((item) => item.guid)).toEqual(['eva', 'ana']);
  });
});

describe('withConversationRead', () => {
  it('deja sin pendientes sólo la conversación leída', () => {
    const updated = withConversationRead([contact('ana', 3), contact('luis', 1)], 'ana');
    expect(updated.map((item) => item.unreadCount)).toEqual([0, 1]);
  });
});

describe('contactFromCandidate', () => {
  it('abre una conversación vacía en la que se puede escribir', () => {
    const candidate = {
      guid: 'eva',
      firstName: 'Eva',
      lastName: 'Gil',
      email: 'eva@campus.test',
      role: 'TEACHER' as const,
      contactStatus: null,
      canWrite: true,
    };
    expect(contactFromCandidate(candidate)).toEqual({
      guid: 'eva',
      firstName: 'Eva',
      lastName: 'Gil',
      role: 'TEACHER',
      lastMessage: '',
      lastMessageAt: null,
      unreadCount: 0,
      canWrite: true,
    });
  });
});
