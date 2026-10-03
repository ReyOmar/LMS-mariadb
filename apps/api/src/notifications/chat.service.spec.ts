import { ChatService } from './chat.service';
import { sessionFor } from '../common/testing/test-campus';

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
      findFirst: async ({ where }: { where: { guid: string } }) => ({ guid: where.guid, country: 'COLOMBIA' }),
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
  return new ChatService(prisma as never, {} as never, {} as never);
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

/**
 * Buscar con quién abrir una conversación.
 *
 * Una sola letra casa con casi todos los de sus cursos y cuesta lo mismo que la lista
 * entera: no se busca. Sin texto sí se listan los primeros, que es como un alumno encuentra
 * a su examinador sin saber cómo se escribe su nombre.
 */
describe('ChatService · buscar personas de sus cursos', () => {
  function searchBase() {
    const userQueries: { where: unknown }[] = [];
    const prisma = {
      enrollment: { findMany: async () => [{ courseGuid: 'curso-1' }] },
      course: { findMany: async () => [] },
      user: {
        findMany: async (query: { where: unknown }) => {
          userQueries.push(query);
          return [{ guid: 'bruno', firstName: 'Bruno', lastName: 'Díaz', email: 'b@x.test', role: 'TEACHER' }];
        },
      },
      chatContact: { findMany: async () => [] },
    };
    return { service: createService(prisma), userQueries };
  }

  it('con una sola letra no consulta nada', async () => {
    const { service, userQueries } = searchBase();

    expect(await service.searchContactCandidates(' b ', ANA)).toEqual([]);
    expect(userQueries).toHaveLength(0);
  });

  it('desde dos letras busca por nombre, apellido y correo', async () => {
    const { service, userQueries } = searchBase();

    const found = await service.searchContactCandidates('Br', ANA);

    expect(found).toHaveLength(1);
    expect(JSON.stringify(userQueries[0].where)).toContain('"contains":"Br"');
  });

  it('sin texto lista a los primeros de sus cursos', async () => {
    const { service, userQueries } = searchBase();

    expect(await service.searchContactCandidates('', ANA)).toHaveLength(1);
    expect(JSON.stringify(userQueries[0].where)).not.toContain('contains');
  });

  it('busca sin tildes: la base ya las ignora al comparar', async () => {
    const { service, userQueries } = searchBase();

    await service.searchContactCandidates('Díaz', ANA);

    expect(JSON.stringify(userQueries[0].where)).toContain('"contains":"Diaz"');
  });
});
