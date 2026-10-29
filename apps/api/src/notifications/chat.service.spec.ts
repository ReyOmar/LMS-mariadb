import { ChatService } from './chat.service';
import { ChatAccess } from './chat-access';
import { sessionFor } from '../common/testing/test-campus';
import { chatCampus } from '../common/testing/chat-campus';

/**
 * Vaciar una conversación.
 *
 * Es una decisión de quien la vacía y de nadie más: la otra persona conserva su copia, y
 * nadie puede eliminar el historial de otro. Lo que se comprueba aquí es que el corte se
 * aplique al que lo pide y sólo a él.
 */

const ANA = sessionFor('STUDENT', 'COLOMBIA', 'ana');
const BRUNO = sessionFor('TEACHER', 'COLOMBIA', 'bruno');

interface TestMessage {
  id: number;
  senderGuid: string;
  recipientGuid: string;
  subject: string;
  content: string;
  read: boolean;
  createdAt: Date;
}

interface TestCutoff {
  userGuid: string;
  contactGuid: string;
  hiddenUntil: Date;
}

/**
 * Doble de Prisma que **interpreta** los filtros de fecha y de pareja.
 * Si el servicio dejara de aplicar el corte, aquí se notaría: el doble no lo aplica por su
 * cuenta.
 */
function baseWith(messages: TestMessage[], cutoffs: TestCutoff[] = []) {
  const betweenTheTwo = (m: TestMessage, where: Record<string, unknown>) => {
    const options = where.OR as { senderGuid: string; recipientGuid: string }[];
    return options.some((o) => m.senderGuid === o.senderGuid && m.recipientGuid === o.recipientGuid);
  };

  const prisma = {
    chatContact: {
      findFirst: async () => ({ id: 1 }),
    },
    user: {
      findFirst: async ({ where }: { where: { guid: string } }) => ({ guid: where.guid, role: 'STUDENT' }),
    },
    notification: {
      updateMany: async () => ({ count: 0 }),
    },
    hiddenConversation: {
      findMany: async ({ where }: { where: { userGuid: string; contactGuid: { in: string[] } } }) =>
        cutoffs.filter((c) => c.userGuid === where.userGuid && where.contactGuid.in.includes(c.contactGuid)),

      upsert: async ({ create }: { create: TestCutoff }) => {
        const existing = cutoffs.find((c) => c.userGuid === create.userGuid && c.contactGuid === create.contactGuid);
        if (existing) existing.hiddenUntil = create.hiddenUntil;
        else cutoffs.push({ ...create });
        return create;
      },
    },
    message: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        messages.find((m) => betweenTheTwo(m, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const cutoff = (where.createdAt as { gt?: Date } | undefined)?.gt;
        return messages
          .filter((m) => betweenTheTwo(m, where))
          .filter((m) => (cutoff ? m.createdAt > cutoff : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
      updateMany: async ({ where }: { where: { senderGuid: string; recipientGuid: string } }) => {
        const affected = messages.filter(
          (m) => m.senderGuid === where.senderGuid && m.recipientGuid === where.recipientGuid && !m.read,
        );
        affected.forEach((m) => (m.read = true));
        return { count: affected.length };
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  return { messages, cutoffs, prisma };
}

function createService(prisma: unknown) {
  return new ChatService(
    prisma as never,
    { emitToUsers: () => undefined } as never,
    {} as never,
    new ChatAccess(prisma as never),
  );
}

const T = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute, 0));

const CONVERSATION: TestMessage[] = [
  {
    id: 1,
    senderGuid: 'ana',
    recipientGuid: 'bruno',
    subject: 'Duda',
    content: 'Primera',
    read: true,
    createdAt: T(0),
  },
  {
    id: 2,
    senderGuid: 'bruno',
    recipientGuid: 'ana',
    subject: 'Re: Duda',
    content: 'Segunda',
    read: false,
    createdAt: T(5),
  },
];

describe('ChatService · vaciar una conversación', () => {
  it('quien la vacía deja de verla', async () => {
    const { prisma } = baseWith([...CONVERSATION].map((m) => ({ ...m })));
    const service = createService(prisma);

    expect(await service.getConversation('bruno', ANA)).toHaveLength(2);

    await service.deleteConversation('bruno', ANA);

    expect(await service.getConversation('bruno', ANA)).toHaveLength(0);
  });

  it('la otra persona conserva la suya intacta', async () => {
    const { prisma } = baseWith([...CONVERSATION].map((m) => ({ ...m })));
    const service = createService(prisma);

    await service.deleteConversation('bruno', ANA);

    const fromBruno = await service.getConversation('ana', BRUNO);
    expect(fromBruno).toHaveLength(2);
    expect(fromBruno.map((m) => m.content)).toEqual(['Primera', 'Segunda']);
  });

  it('los mensajes posteriores vuelven a verse', async () => {
    const messages = [...CONVERSATION].map((m) => ({ ...m }));
    const { prisma } = baseWith(messages);
    const service = createService(prisma);

    await service.deleteConversation('bruno', ANA);

    messages.push({
      id: 3,
      senderGuid: 'bruno',
      recipientGuid: 'ana',
      subject: 'Nuevo',
      content: 'Tercera',
      read: false,
      createdAt: new Date(Date.now() + 60_000),
    });

    const after = await service.getConversation('bruno', ANA);
    expect(after.map((m) => m.content)).toEqual(['Tercera']);
  });

  it('lo vaciado deja de contar como pendiente de leer', async () => {
    const messages = [...CONVERSATION].map((m) => ({ ...m }));
    const { prisma } = baseWith(messages);

    await createService(prisma).deleteConversation('bruno', ANA);

    expect(messages.every((m) => m.read)).toBe(true);
  });

  it('vaciar dos veces no rompe nada y mantiene el corte más reciente', async () => {
    const { prisma, cutoffs } = baseWith([...CONVERSATION].map((m) => ({ ...m })));
    const service = createService(prisma);

    await service.deleteConversation('bruno', ANA);
    const first = cutoffs[0].hiddenUntil;
    await service.deleteConversation('bruno', ANA);

    expect(cutoffs).toHaveLength(1);
    expect(cutoffs[0].hiddenUntil.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });
});

const session = (role: 'ADMIN' | 'TEACHER' | 'STUDENT', guid: string) => sessionFor(role, 'COLOMBIA', guid);
const messageTo = (recipientGuid: string) => ({ recipientGuid, subject: 'Mensaje', content: 'Hola' });

/** Con las reglas de `ChatAccess`, sobre el campus en memoria de la mensajería. */
describe('ChatService · quién puede escribir a quién', () => {
  it('el administrador escribe a cualquiera de su sede sin solicitud', async () => {
    const { chat, messages } = chatCampus();

    await chat.sendMessage(messageTo('dario'), session('ADMIN', 'admin'));

    expect(messages).toHaveLength(1);
  });

  it('se puede responder al administrador', async () => {
    const { chat } = chatCampus();

    await expect(chat.sendMessage(messageTo('admin'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('el examinador y los alumnos activos de su curso se escriben sin solicitud', async () => {
    const { chat } = chatCampus();

    await expect(chat.sendMessage(messageTo('ana'), session('TEACHER', 'bruno'))).resolves.toBeDefined();
    await expect(chat.sendMessage(messageTo('bruno'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('el examinador no escribe sin solicitud a alumnos de cursos ajenos', async () => {
    const { chat } = chatCampus();

    await expect(chat.sendMessage(messageTo('dario'), session('TEACHER', 'bruno'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );
  });

  it('entre alumnos del mismo curso hace falta la solicitud aceptada', async () => {
    const { chat, contacts } = chatCampus();

    await expect(chat.sendMessage(messageTo('carla'), session('STUDENT', 'ana'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );

    contacts.push({ id: 2, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'ACCEPTED' });

    await expect(chat.sendMessage(messageTo('carla'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('un contacto aceptado que ya no comparte un curso activo no recibe mensajes', async () => {
    const { chat, messages } = chatCampus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'dario', courseGuid: 'curso-2', status: 'ACCEPTED' },
    ]);

    await expect(chat.sendMessage(messageTo('dario'), session('STUDENT', 'ana'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );
    expect(messages).toHaveLength(0);
  });

  it('nadie escribe a otra sede, tampoco el administrador', async () => {
    const { chat } = chatCampus();

    await expect(chat.sendMessage(messageTo('mara'), session('ADMIN', 'admin'))).rejects.toThrow(
      'Usuario no encontrado',
    );
  });
});

describe('ChatService · avisos de mensajes', () => {
  it('leer la conversación marca sus avisos de la campana y lo anuncia a sus pestañas', async () => {
    const { chat, notifications, emitted } = chatCampus();
    await chat.sendMessage(messageTo('ana'), session('TEACHER', 'bruno'));
    await chat.sendMessage(messageTo('ana'), session('ADMIN', 'admin'));

    await chat.markConversationRead('bruno', session('STUDENT', 'ana'));

    expect(notifications.map((n) => [n.refGuid, n.read])).toEqual([
      ['bruno', true],
      ['admin', false],
    ]);
    expect(emitted).toContainEqual({ event: 'message:read', guids: ['ana'] });
  });

  it('si no había nada por leer, no anuncia nada', async () => {
    const { chat, emitted } = chatCampus();

    await chat.markConversationRead('bruno', session('STUDENT', 'ana'));

    expect(emitted).toEqual([]);
  });
});

describe('ChatService · vaciar una conversación ajena', () => {
  it('no admite a alguien de otra sede', async () => {
    const { chat } = chatCampus();

    await expect(chat.deleteConversation('mara', session('ADMIN', 'admin'))).rejects.toThrow('Usuario no encontrado');
  });

  it('no admite a alguien con quien no hay conversación', async () => {
    const { chat } = chatCampus();

    await expect(chat.deleteConversation('carla', session('STUDENT', 'ana'))).rejects.toThrow(
      'No tienes ninguna conversación',
    );
  });

  it('sí admite una conversación que abrió el administrador', async () => {
    const { chat } = chatCampus();
    await chat.sendMessage(messageTo('ana'), session('ADMIN', 'admin'));

    await expect(chat.deleteConversation('admin', session('STUDENT', 'ana'))).resolves.toBeDefined();
  });
});
