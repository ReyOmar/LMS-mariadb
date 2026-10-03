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
  return new ChatService(prisma as never, { emitToUsers: () => undefined } as never, {} as never);
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

/**
 * Quién puede escribir a quién.
 *
 * Campus en memoria que interpreta las consultas de la mensajería: si el servicio dejara
 * de exigir el curso activo, la solicitud aceptada o la sede, el doble no lo suple.
 *
 * En Colombia, Bruno examina el curso 1 (Ana y Carla, activas) y Elena el curso 2 (Darío
 * activo; Ana se dio de baja). Ana y Darío se aceptaron como contactos cuando compartían
 * el curso 2. Mara es alumna de México.
 */
type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface Pair {
  requesterGuid?: unknown;
  receiverGuid?: unknown;
  senderGuid?: unknown;
  recipientGuid?: unknown;
}

interface Contact {
  id: number;
  requesterGuid: string;
  receiverGuid: string;
  courseGuid: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

interface CourseWhere {
  country: string;
  teacherGuid?: string;
  AND?: [{ OR: [{ teacherGuid: string }] }, { OR: [{ teacherGuid: { in: string[] } }] }];
}

const PAIR_FIELDS = ['requesterGuid', 'receiverGuid', 'senderGuid', 'recipientGuid'] as const;

const matches = (value: unknown, filter: unknown) =>
  typeof filter === 'string' ? value === filter : (filter as { in: string[] }).in.includes(value as string);

function campus(contacts: Contact[] = []) {
  const users: { guid: string; role: Role; country: string }[] = [
    { guid: 'admin', role: 'ADMIN', country: 'COLOMBIA' },
    { guid: 'bruno', role: 'TEACHER', country: 'COLOMBIA' },
    { guid: 'elena', role: 'TEACHER', country: 'COLOMBIA' },
    { guid: 'ana', role: 'STUDENT', country: 'COLOMBIA' },
    { guid: 'carla', role: 'STUDENT', country: 'COLOMBIA' },
    { guid: 'dario', role: 'STUDENT', country: 'COLOMBIA' },
    { guid: 'mara', role: 'STUDENT', country: 'MEXICO' },
  ];
  const courses = [
    { guid: 'curso-1', teacherGuid: 'bruno', country: 'COLOMBIA' },
    { guid: 'curso-2', teacherGuid: 'elena', country: 'COLOMBIA' },
  ];
  const enrollments = [
    { userGuid: 'ana', courseGuid: 'curso-1', active: true },
    { userGuid: 'carla', courseGuid: 'curso-1', active: true },
    { userGuid: 'dario', courseGuid: 'curso-2', active: true },
    { userGuid: 'ana', courseGuid: 'curso-2', active: false },
  ];
  const messages: { id: number; senderGuid: string; recipientGuid: string; read: boolean }[] = [];
  const notifications: { userGuid: string; refType?: string; refGuid?: string; read: boolean }[] = [];
  const emitted: { event: string; guids: readonly string[] }[] = [];

  const activeIn = (userGuid: string, courseGuid: string) =>
    enrollments.some((e) => e.userGuid === userGuid && e.courseGuid === courseGuid && e.active);
  const participates = (userGuid: string, course: { guid: string; teacherGuid: string }) =>
    course.teacherGuid === userGuid || activeIn(userGuid, course.guid);
  const pairMatches = (row: Pair, options: Pair[]) =>
    options.some((option) =>
      PAIR_FIELDS.every((field) => option[field] === undefined || matches(row[field], option[field])),
    );
  const contactMatches = (contact: Contact, where: { status?: string; courseGuid?: string; OR: Pair[] }) =>
    (!where.status || contact.status === where.status) &&
    (!where.courseGuid || contact.courseGuid === where.courseGuid) &&
    pairMatches(contact, where.OR);

  const prisma = {
    user: {
      findFirst: async ({ where }: { where: { guid: string; country: string } }) =>
        users.find((u) => u.guid === where.guid && u.country === where.country) ?? null,
      findUnique: async ({ where }: { where: { guid: string } }) =>
        users.some((u) => u.guid === where.guid) ? { firstName: where.guid, lastName: 'Prueba' } : null,
    },
    course: {
      // Cursos que examina el usuario (`userCourses`) o cursos suyos en los que participa
      // alguno de los demás (`writableAmong`).
      findMany: async ({ where }: { where: CourseWhere }) => {
        if (!where.AND) {
          return courses
            .filter((c) => c.teacherGuid === where.teacherGuid && c.country === where.country)
            .map((c) => ({ guid: c.guid }));
        }
        const me = where.AND[0].OR[0].teacherGuid;
        const others = where.AND[1].OR[0].teacherGuid.in;
        return courses
          .filter((c) => c.country === where.country && participates(me, c))
          .filter((c) => others.some((other) => participates(other, c)))
          .map((c) => ({
            teacherGuid: c.teacherGuid,
            enrollments: enrollments
              .filter((e) => e.courseGuid === c.guid && e.active && others.includes(e.userGuid))
              .map((e) => ({ userGuid: e.userGuid })),
          }));
      },
      findFirst: async ({ where }: { where: { guid: unknown; country: string; OR: [{ teacherGuid: string }] } }) => {
        const receiver = where.OR[0].teacherGuid;
        const found = courses.find(
          (c) => matches(c.guid, where.guid) && c.country === where.country && participates(receiver, c),
        );
        return found ? { guid: found.guid } : null;
      },
    },
    enrollment: {
      findMany: async ({ where }: { where: { userGuid: string } }) =>
        enrollments.filter((e) => e.userGuid === where.userGuid && e.active).map((e) => ({ courseGuid: e.courseGuid })),
    },
    chatContact: {
      findMany: async ({ where }: { where: { status?: string; OR: Pair[] } }) =>
        contacts.filter((c) => contactMatches(c, where)),
      findFirst: async ({
        where,
      }: {
        where: { id?: number; receiverGuid?: string; status?: string; courseGuid?: string; OR?: Pair[] };
      }) =>
        contacts.find((c) =>
          where.id !== undefined
            ? c.id === where.id && c.receiverGuid === where.receiverGuid && c.status === where.status
            : contactMatches(c, { ...where, OR: where.OR ?? [] }),
        ) ?? null,
      create: async ({ data }: { data: Omit<Contact, 'id'> }) => {
        const contact = { id: contacts.length + 1, ...data };
        contacts.push(contact);
        return contact;
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<Contact> }) => {
        const contact = contacts.find((c) => c.id === where.id);
        return Object.assign(contact ?? {}, data);
      },
    },
    message: {
      create: async ({ data }: { data: { senderGuid: string; recipientGuid: string } }) => {
        const created = { id: messages.length + 1, ...data, read: false, createdAt: new Date() };
        messages.push(created);
        return created;
      },
      findFirst: async ({ where }: { where: { OR: Pair[] } }) => messages.find((m) => pairMatches(m, where.OR)) ?? null,
      updateMany: async ({ where }: { where: { senderGuid: string; recipientGuid: string } }) => {
        const affected = messages.filter(
          (m) => m.senderGuid === where.senderGuid && m.recipientGuid === where.recipientGuid && !m.read,
        );
        affected.forEach((m) => (m.read = true));
        return { count: affected.length };
      },
    },
    notification: {
      updateMany: async ({ where }: { where: { userGuid: string; refType: string; refGuid: string } }) => {
        const affected = notifications.filter(
          (n) => n.userGuid === where.userGuid && n.refType === where.refType && n.refGuid === where.refGuid && !n.read,
        );
        affected.forEach((n) => (n.read = true));
        return { count: affected.length };
      },
    },
    hiddenConversation: {
      upsert: async () => ({}),
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  const realtime = {
    emitToUsers: (event: string, _data: unknown, _country: string, guids: readonly string[]) => {
      emitted.push({ event, guids });
    },
  };
  const notificationsService = {
    create: async (data: { userGuid: string; refType?: string; refGuid?: string }) => {
      notifications.push({ ...data, read: false });
      return data;
    },
  };

  const service = new ChatService(prisma as never, realtime as never, notificationsService as never);
  return { service, contacts, messages, notifications, emitted };
}

const session = (role: Role, guid: string) => sessionFor(role, 'COLOMBIA', guid);
const messageTo = (recipientGuid: string) => ({ recipientGuid, subject: 'Mensaje', content: 'Hola' });

describe('ChatService · quién puede escribir a quién', () => {
  it('el administrador escribe a cualquiera de su sede sin solicitud', async () => {
    const { service, messages } = campus();

    await service.sendMessage(messageTo('dario'), session('ADMIN', 'admin'));

    expect(messages).toHaveLength(1);
  });

  it('se puede responder al administrador', async () => {
    const { service } = campus();

    await expect(service.sendMessage(messageTo('admin'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('el examinador y los alumnos activos de su curso se escriben sin solicitud', async () => {
    const { service } = campus();

    await expect(service.sendMessage(messageTo('ana'), session('TEACHER', 'bruno'))).resolves.toBeDefined();
    await expect(service.sendMessage(messageTo('bruno'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('el examinador no escribe sin solicitud a alumnos de cursos ajenos', async () => {
    const { service } = campus();

    await expect(service.sendMessage(messageTo('dario'), session('TEACHER', 'bruno'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );
  });

  it('entre alumnos del mismo curso hace falta la solicitud aceptada', async () => {
    const { service, contacts } = campus();

    await expect(service.sendMessage(messageTo('carla'), session('STUDENT', 'ana'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );

    contacts.push({ id: 2, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'ACCEPTED' });

    await expect(service.sendMessage(messageTo('carla'), session('STUDENT', 'ana'))).resolves.toBeDefined();
  });

  it('un contacto aceptado que ya no comparte un curso activo no recibe mensajes', async () => {
    const { service, messages } = campus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'dario', courseGuid: 'curso-2', status: 'ACCEPTED' },
    ]);

    await expect(service.sendMessage(messageTo('dario'), session('STUDENT', 'ana'))).rejects.toThrow(
      'No puedes escribir a esta persona',
    );
    expect(messages).toHaveLength(0);
  });

  it('nadie escribe a otra sede, tampoco el administrador', async () => {
    const { service } = campus();

    await expect(service.sendMessage(messageTo('mara'), session('ADMIN', 'admin'))).rejects.toThrow(
      'Usuario no encontrado',
    );
  });
});

describe('ChatService · avisos de mensajes', () => {
  it('leer la conversación marca sus avisos de la campana y lo anuncia a sus pestañas', async () => {
    const { service, notifications, emitted } = campus();
    await service.sendMessage(messageTo('ana'), session('TEACHER', 'bruno'));
    await service.sendMessage(messageTo('ana'), session('ADMIN', 'admin'));

    await service.markConversationRead('bruno', session('STUDENT', 'ana'));

    expect(notifications.map((n) => [n.refGuid, n.read])).toEqual([
      ['bruno', true],
      ['admin', false],
    ]);
    expect(emitted).toContainEqual({ event: 'message:read', guids: ['ana'] });
  });

  it('si no había nada por leer, no anuncia nada', async () => {
    const { service, emitted } = campus();

    await service.markConversationRead('bruno', session('STUDENT', 'ana'));

    expect(emitted).toEqual([]);
  });
});

describe('ChatService · solicitudes de contacto', () => {
  it('reintentar una solicitud rechazada vuelve a avisar a quien la recibe', async () => {
    const { service, contacts, notifications, emitted } = campus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'REJECTED' },
    ]);

    await service.requestContact('carla', undefined, session('STUDENT', 'ana'));

    expect(contacts[0].status).toBe('PENDING');
    expect(notifications.map((n) => n.userGuid)).toEqual(['carla']);
    expect(emitted).toContainEqual({ event: 'contact:updated', guids: ['carla'] });
  });

  it('al aceptarla, quien la pidió ve el cambio en vivo', async () => {
    const { service, emitted } = campus([
      { id: 1, requesterGuid: 'ana', receiverGuid: 'carla', courseGuid: 'curso-1', status: 'PENDING' },
    ]);

    await service.respondToRequest(1, true, session('STUDENT', 'carla'));

    expect(emitted).toContainEqual({ event: 'contact:updated', guids: ['ana'] });
  });

  it('no hace falta pedir contacto a quien ya se puede escribir', async () => {
    const { service, contacts } = campus();

    await expect(service.requestContact('bruno', undefined, session('STUDENT', 'ana'))).rejects.toThrow(
      'no hace falta',
    );
    expect(contacts).toHaveLength(0);
  });
});

describe('ChatService · vaciar una conversación ajena', () => {
  it('no admite a alguien de otra sede', async () => {
    const { service } = campus();

    await expect(service.deleteConversation('mara', session('ADMIN', 'admin'))).rejects.toThrow(
      'Usuario no encontrado',
    );
  });

  it('no admite a alguien con quien no hay conversación', async () => {
    const { service } = campus();

    await expect(service.deleteConversation('carla', session('STUDENT', 'ana'))).rejects.toThrow(
      'No tienes ninguna conversación',
    );
  });

  it('sí admite una conversación que abrió el administrador', async () => {
    const { service } = campus();
    await service.sendMessage(messageTo('ana'), session('ADMIN', 'admin'));

    await expect(service.deleteConversation('admin', session('STUDENT', 'ana'))).resolves.toBeDefined();
  });
});

describe('ChatService · el administrador busca con quién hablar', () => {
  it('busca en toda su sede, sin exigir curso, y puede escribir a todos', async () => {
    const userQueries: { where: unknown }[] = [];
    const prisma = {
      user: {
        findMany: async (query: { where: unknown }) => {
          userQueries.push(query);
          return [{ guid: 'dario', firstName: 'Darío', lastName: 'Ruiz', email: 'd@x.test', role: 'STUDENT' }];
        },
      },
      chatContact: { findMany: async () => [] },
    };

    const found = await createService(prisma).searchContactCandidates('Da', session('ADMIN', 'admin'));

    const where = JSON.stringify(userQueries[0].where);
    expect(where).toContain('"country":"COLOMBIA"');
    expect(where).not.toContain('enrollments');
    expect(found).toEqual([expect.objectContaining({ guid: 'dario', canWrite: true, contactStatus: null })]);
  });
});
