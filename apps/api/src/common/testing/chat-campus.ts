import { ChatAccess } from '../../notifications/chat-access';
import { ChatContactsService } from '../../notifications/chat-contacts.service';
import { ChatService } from '../../notifications/chat.service';

/**
 * Campus en memoria que interpreta las consultas de la mensajería: si los servicios dejaran
 * de exigir el curso activo, la solicitud aceptada o la sede, el doble no lo suple.
 *
 * En Colombia, Bruno examina el curso 1 (Ana y Carla, activas) y Elena el curso 2 (Darío
 * activo; Ana se dio de baja). Mara es alumna de México.
 */

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface Pair {
  requesterGuid?: unknown;
  receiverGuid?: unknown;
  senderGuid?: unknown;
  recipientGuid?: unknown;
}

interface TestContact {
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

export function chatCampus(contacts: TestContact[] = []) {
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
  const contactMatches = (contact: TestContact, where: { status?: string; courseGuid?: string; OR: Pair[] }) =>
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
      // Cursos que examina el usuario (`ChatContactsService`) o cursos suyos en los que
      // participa alguno de los demás (`ChatAccess.writableAmong`).
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
      create: async ({ data }: { data: Omit<TestContact, 'id'> }) => {
        const contact = { id: contacts.length + 1, ...data };
        contacts.push(contact);
        return contact;
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<TestContact> }) => {
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

  const access = new ChatAccess(prisma as never);
  return {
    chat: new ChatService(prisma as never, realtime as never, notificationsService as never, access),
    requests: new ChatContactsService(prisma as never, realtime as never, notificationsService as never, access),
    contacts,
    messages,
    notifications,
    emitted,
  };
}
