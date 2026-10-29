import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExternalEnrollmentsService } from './external-enrollments.service';
import { WaitingRequestsService } from './waiting-requests.service';
import { WaitingReminders } from './waiting-reminders';
import { InfractionsService } from './infractions.service';
import { IntegrationCourses } from './integration-courses';
import { IntegrationViews } from './integration-views';
import { CourseFullException } from '../enrollments/course-capacity';
import type { IntegrationCaller } from './integration-auth';
import type { ExternalEnrollmentDto } from './dto/external-enrollment.dto';

/**
 * Matrículas que piden otros sistemas.
 *
 * El caso que las motiva: el sistema del PESV bloquea a un conductor por una infracción y pide que
 * haga su curso; sólo vuelve a habilitarlo cuando lo termina. El PESV no sabe nada de los cursos:
 * envía la infracción, y el campus le busca el curso por su título o lo elige un administrador. Aquí
 * se fija que la persona quede matriculada una sola vez, que espere mientras la infracción no tenga
 * un curso que la admita y que los administradores se enteren sin recibir un correo por solicitud.
 */

const PESV: IntegrationCaller = { id: 1, name: 'Software PESV', country: 'COLOMBIA' };

interface CourseRow {
  guid: string;
  country: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  maxStudents: number | null;
  occupied: number;
  teacherGuid: string;
  passingScore: number;
}

interface InfractionRow {
  id: number;
  country: string;
  code: string;
  description: string | null;
  courseGuid: string | null;
  autoAssigned?: boolean;
}

interface UserRow {
  guid: string;
  email: string;
  firstName: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
  country: string;
}

const course = (fields: Partial<CourseRow> = {}): CourseRow => ({
  guid: 'curso-1',
  country: 'COLOMBIA',
  title: 'Manejo defensivo',
  status: 'PUBLISHED',
  maxStudents: null,
  occupied: 0,
  teacherGuid: 'profe',
  passingScore: 80,
  ...fields,
});

/** La infracción C29 de Colombia, que atiende el curso indicado (ninguno si es `null`). */
const C29 = (courseGuid: string | null = 'curso-1'): InfractionRow => ({
  id: 1,
  country: 'COLOMBIA',
  code: 'C29',
  description: 'Exceso de velocidad',
  courseGuid,
});

const ADMIN: UserRow = {
  guid: 'admin',
  email: 'admin@pesv.test',
  firstName: 'Admin',
  role: 'ADMIN',
  country: 'COLOMBIA',
};

/** Ana ya tiene cuenta de estudiante en la sede. */
const ANA: UserRow = {
  guid: 'ana',
  email: 'ana@empresa.com',
  firstName: 'Ana',
  role: 'STUDENT',
  country: 'COLOMBIA',
};

const request = (fields: Partial<ExternalEnrollmentDto> = {}): ExternalEnrollmentDto => ({
  externalId: 'INF-1',
  infractionCode: 'C29',
  infractionDescription: 'Exceso de velocidad',
  country: 'COLOMBIA',
  firstName: 'Ana',
  lastName: 'Ramírez',
  email: 'ana@empresa.com',
  ...fields,
});

/** El campus en memoria: sólo lo que consultan las matrículas externas. */
function campus({
  courses = [] as CourseRow[],
  users = [ADMIN] as UserRow[],
  infractions = [] as InfractionRow[],
} = {}) {
  const rows: Record<string, unknown>[] = [];
  const enrollments = new Map<string, { active: boolean; enrolledAt: Date; completedAt: Date | null }>();
  const certificates: { guid: string; userGuid: string; courseGuid: string; completedAt: Date }[] = [];
  const accountOf = (email: string) => users.find((u) => u.email === email);
  const infractionOf = (row: Record<string, unknown>) => infractions.find((i) => i.id === row.infractionId)!;
  let clock = Date.parse('2026-10-01T08:00:00Z');
  jest.setSystemTime(clock);

  const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([field, expected]) => {
      // Un filtro por la infracción de la solicitud, como `{ infraction: { courseGuid } }`.
      if (field === 'infraction') return matches({ ...infractionOf(row) }, expected as Record<string, unknown>);
      if (field === 'OR') return (expected as Record<string, unknown>[]).some((option) => matches(row, option));
      if (expected && typeof expected === 'object' && 'gte' in expected) {
        return row[field] instanceof Date && (row[field] as Date) >= (expected as { gte: Date }).gte;
      }
      return row[field] === expected;
    });
  const view = (row: Record<string, unknown>) => ({
    ...row,
    infraction: infractionOf(row),
    course: row.courseGuid ? { title: courses.find((c) => c.guid === row.courseGuid)?.title } : null,
    certificate: row.certificate ?? null,
  });
  const findRequest = ({ where }: { where: Record<string, any> }) => {
    const row = where.clientId_externalId
      ? rows.find(
          (r) =>
            r.clientId === where.clientId_externalId.clientId && r.externalId === where.clientId_externalId.externalId,
        )
      : rows.find((r) => r.guid === where.guid);
    return row ? view(row) : null;
  };
  const infractionAt = ({ country, code }: { country: string; code: string }) =>
    infractions.find((i) => i.country === country && i.code === code);

  const prisma = {
    externalEnrollment: {
      findUnique: async (query: { where: Record<string, unknown> }) => findRequest(query),
      findUniqueOrThrow: async (query: { where: Record<string, unknown> }) => findRequest(query)!,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          guid: `solicitud-${rows.length + 1}`,
          status: 'WAITING',
          rejectionReason: null,
          userGuid: null,
          courseGuid: null,
          roundStartedAt: null,
          adminNotifiedAt: null,
          createdAt: new Date((clock += 1000)),
          ...data,
        };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { guid: string }; data: Record<string, unknown> }) =>
        Object.assign(rows.find((r) => r.guid === where.guid)!, data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = rows.filter((r) => matches(r, where));
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => matches(r, where)).map((r) => ({ ...view(r), client: { name: PESV.name } })),
      count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
    },
    infraction: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { country_code: { country: string; code: string } };
        create: Omit<InfractionRow, 'id' | 'courseGuid'>;
        update: Partial<InfractionRow>;
      }) => {
        const existing = infractionAt(where.country_code);
        if (existing) return Object.assign(existing, update);
        const created = { id: infractions.length + 1, courseGuid: null, ...create };
        infractions.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { country_code: { country: string; code: string } };
        data: Partial<InfractionRow>;
      }) => Object.assign(infractionAt(where.country_code)!, data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<InfractionRow> }) => {
        const hits = infractions.filter((i) => matches({ ...i }, where));
        hits.forEach((i) => Object.assign(i, data));
        return { count: hits.length };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => infractions.find((i) => i.id === where.id)!,
      findMany: async ({ where }: { where: { country: string } }) =>
        infractions
          .filter((i) => i.country === where.country)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map(({ id, code, description, courseGuid, autoAssigned = false }) => {
            const assigned = courses.find((c) => c.guid === courseGuid);
            return {
              id,
              code,
              description,
              course: assigned ? { guid: assigned.guid, title: assigned.title, status: assigned.status } : null,
              autoAssigned,
              requests: rows
                .filter((r) => r.infractionId === id && r.status === 'WAITING')
                .map((r) => ({ ...r, client: { name: PESV.name } })),
            };
          }),
    },
    course: {
      findUnique: async ({ where }: { where: { guid: string } }) => courses.find((c) => c.guid === where.guid) ?? null,
      findFirst: async ({ where }: { where: { guid: string; country: string } }) =>
        courses.find((c) => c.guid === where.guid && c.country === where.country) ?? null,
      // Los publicados de la sede, entre los que se busca el de una infracción sin curso.
      findMany: async ({ where }: { where: { country: string; status: string } }) =>
        courses.filter((c) => c.country === where.country && c.status === where.status),
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null,
      findMany: async ({ where }: { where: Partial<UserRow> }) => users.filter((u) => matches({ ...u }, where)),
    },
    enrollment: {
      // Sin `user`, las plazas ocupadas del curso; con él, si esa persona lo está cursando.
      count: async ({ where }: { where: { courseGuid: string; user?: { email: string } } }) => {
        if (!where.user) return courses.find((c) => c.guid === where.courseGuid)?.occupied ?? 0;
        const current = enrollments.get(`${accountOf(where.user.email)?.guid}|${where.courseGuid}`);
        return current?.active && !current.completedAt ? 1 : 0;
      },
      findUnique: async ({ where }: { where: { userGuid_courseGuid: { userGuid: string; courseGuid: string } } }) =>
        enrollments.get(`${where.userGuid_courseGuid.userGuid}|${where.userGuid_courseGuid.courseGuid}`) ?? null,
    },
    certificate: {
      findFirst: async ({
        where,
      }: {
        where: { courseGuid: string; user: { email: string }; completedAt: { gte: Date } };
      }) =>
        certificates.find(
          (c) =>
            c.courseGuid === where.courseGuid &&
            c.userGuid === accountOf(where.user.email)?.guid &&
            c.completedAt >= where.completedAt.gte,
        ) ?? null,
    },
  };

  const accountsCreated: string[] = [];
  const userService = {
    createUser: jest.fn(async (dto: { email: string; firstName: string }, country: string) => {
      const user = {
        guid: `cuenta-${dto.email}`,
        email: dto.email,
        firstName: dto.firstName,
        role: 'STUDENT' as const,
        country,
      };
      users.push(user);
      accountsCreated.push(dto.email);
      return { user };
    }),
  };
  const enrollmentService = {
    enrollFromIntegration: jest.fn(async (target: CourseRow, student: { guid: string; email: string }) => {
      // Quien ya lo está cursando sigue en su vuelta, sin ocupar otra plaza.
      const current = enrollments.get(`${student.guid}|${target.guid}`);
      if (current?.active && !current.completedAt) return current.enrolledAt;

      // Recibe una copia del curso: las plazas se cuentan en el original, como en la base.
      const original = courses.find((c) => c.guid === target.guid)!;
      if (original.maxStudents !== null && original.occupied >= original.maxStudents) {
        throw new CourseFullException(original.maxStudents);
      }
      original.occupied++;
      const enrolledAt = new Date((clock += 1000));
      enrollments.set(`${student.guid}|${target.guid}`, { active: true, enrolledAt, completedAt: null });
      return enrolledAt;
    }),
  };
  const mail = { sendEnrollmentWaiting: jest.fn(async () => undefined) };
  const notifications = { create: jest.fn(async () => undefined) };
  const realtime = { emitToRole: jest.fn() };
  const config = { get: () => 'https://campus.test/' };

  const courseLookups = new IntegrationCourses(prisma as never);
  const reminders = new WaitingReminders(prisma as never, mail as never, notifications as never);
  const waiting = new WaitingRequestsService(
    prisma as never,
    userService as never,
    enrollmentService as never,
    courseLookups,
    reminders,
    realtime as never,
  );
  const infractionCatalog = new InfractionsService(prisma as never, courseLookups, waiting);
  const views = new IntegrationViews(prisma as never, courseLookups, config as never);
  const service = new ExternalEnrollmentsService(prisma as never, waiting, infractionCatalog, views);
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }

  return {
    service,
    waiting,
    infractionCatalog,
    prisma,
    rows,
    courses,
    users,
    infractions,
    accountsCreated,
    createUser: userService.createUser,
    enrollFromIntegration: enrollmentService.enrollFromIntegration,
    mail,
    notifications,
    /** Un administrador matricula a mano, desde el panel, a quien ya tiene cuenta. */
    enroll: (email: string, courseGuid: string) => {
      const enrolledAt = new Date((clock += 1000));
      enrollments.set(`${accountOf(email)!.guid}|${courseGuid}`, { active: true, enrolledAt, completedAt: null });
      courses.find((c) => c.guid === courseGuid)!.occupied++;
    },
    /** Quien lo estaba cursando lo aprueba y recibe su certificado: deja libre su plaza. */
    certify: (email: string, courseGuid: string) => {
      const userGuid = accountOf(email)!.guid;
      const completedAt = new Date((clock += 1000));
      enrollments.get(`${userGuid}|${courseGuid}`)!.completedAt = completedAt;
      courses.find((c) => c.guid === courseGuid)!.occupied--;
      certificates.push({ guid: `cert-${certificates.length + 1}`, userGuid, courseGuid, completedAt });
    },
    /** Pasa el reloj, para los recordatorios diarios. */
    advanceHours: (hours: number) => {
      clock += hours * 3600_000;
      jest.setSystemTime(clock);
    },
  };
}

beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
afterEach(() => jest.useRealTimers());

describe('ExternalEnrollmentsService · recepción', () => {
  it('si la infracción ya tiene curso publicado, crea la cuenta, matricula y contesta 201 con el enlace', async () => {
    const { service, accountsCreated, enrollFromIntegration } = campus({ courses: [course()], infractions: [C29()] });

    const { created, view } = await service.receive(request(), PESV);

    expect(created).toBe(true);
    expect(accountsCreated).toEqual(['ana@empresa.com']);
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
    expect(view).toMatchObject({
      externalId: 'INF-1',
      status: 'ENROLLED',
      country: 'CO',
      infraction: { code: 'C29', description: 'Exceso de velocidad' },
      course: { title: 'Manejo defensivo', url: 'https://campus.test/courses/curso-1' },
      enrolledAt: expect.any(Date),
      certificate: null,
    });
  });

  it('una solicitud para otra sede que la de la clave se rechaza sin dejar rastro', async () => {
    const { service, rows, infractions } = campus({ courses: [course()], infractions: [C29()] });

    await expect(service.receive(request({ country: 'MEXICO' }), PESV)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows).toHaveLength(0);
    expect(infractions[0].courseGuid).toBe('curso-1');
  });

  it('lo que contesta queda como lo último que sabe el otro sistema: no se le avisa de ello', async () => {
    const { service, rows } = campus({ courses: [course()], infractions: [C29()] });

    await service.receive(request(), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'beto@empresa.com', infractionCode: 'C35' }), PESV);

    expect(rows.map((row) => row.notifiedStatus)).toEqual(['ENROLLED', 'WAITING']);
  });

  it('quien ya tiene cuenta de estudiante en la sede entra con ella', async () => {
    const { service, accountsCreated, enrollFromIntegration } = campus({
      courses: [course()],
      users: [ADMIN, ANA],
      infractions: [C29()],
    });

    await service.receive(request(), PESV);

    expect(accountsCreated).toEqual([]);
    expect(enrollFromIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ guid: 'curso-1' }),
      expect.objectContaining({ guid: 'ana' }),
    );
  });

  it('la primera solicitud por una infracción la registra en la sede, con la última descripción que llegue', async () => {
    const { service, infractions } = campus();

    await service.receive(request({ infractionDescription: null }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'beto@empresa.com' }), PESV);
    await service.receive(request({ externalId: 'INF-3', email: 'caro@empresa.com', infractionCode: 'C35' }), PESV);
    await service.receive(
      request({ externalId: 'INF-4', email: 'dani@empresa.com', infractionDescription: null }),
      PESV,
    );

    expect(infractions).toEqual([
      expect.objectContaining({ id: 1, country: 'COLOMBIA', code: 'C29', description: 'Exceso de velocidad' }),
      expect.objectContaining({ id: 2, country: 'COLOMBIA', code: 'C35' }),
    ]);
  });

  it('si otra solicitud registra la misma infracción a la vez, usa esa en lugar de fallar', async () => {
    const { service, prisma, infractions, rows } = campus();
    const upsert = prisma.infraction.upsert;
    prisma.infraction.upsert = async (args) => {
      await upsert(args);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7' });
    };

    await service.receive(request(), PESV);

    expect(infractions).toHaveLength(1);
    expect(rows[0]).toMatchObject({ infractionId: 1 });
  });

  it('repetir el envío devuelve la misma solicitud (200) sin matricular otra vez', async () => {
    const { service, enrollFromIntegration, rows } = campus({ courses: [course()], infractions: [C29()] });

    await service.receive(request(), PESV);
    const retry = await service.receive(request(), PESV);

    expect(retry.created).toBe(false);
    expect(retry.view.status).toBe('ENROLLED');
    expect(rows).toHaveLength(1);
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });

  it('reutilizar el identificador para otra persona u otra infracción es un error del otro sistema', async () => {
    const { service } = campus({ courses: [course()], infractions: [C29()] });
    await service.receive(request(), PESV);

    await expect(service.receive(request({ infractionCode: 'C35' }), PESV)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.receive(request({ email: 'beto@empresa.com' }), PESV)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('un correo de otra sede o del personal no se matricula ni deja solicitud ni infracción', async () => {
    const mexican: UserRow = {
      guid: 'mx',
      email: 'ana@empresa.com',
      firstName: 'Ana',
      role: 'STUDENT',
      country: 'MEXICO',
    };
    const fromMexico = campus({ users: [ADMIN, mexican] });
    await expect(fromMexico.service.receive(request(), PESV)).rejects.toBeInstanceOf(ConflictException);
    expect(fromMexico.rows).toHaveLength(0);
    expect(fromMexico.infractions).toHaveLength(0);

    const staff = campus();
    await expect(staff.service.receive(request({ email: ADMIN.email }), PESV)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(staff.rows).toHaveLength(0);
  });

  it('si la cuenta se crea a la vez por otra vía, entra con esa en lugar de fallar', async () => {
    const { service, users, createUser } = campus({ courses: [course()], infractions: [C29()] });
    createUser.mockImplementationOnce(async () => {
      users.push(ANA);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7' });
    });

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('ENROLLED');
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('sólo se consulta lo que pidió el mismo sistema', async () => {
    const { service } = campus({ courses: [course()], infractions: [C29()] });
    await service.receive(request(), PESV);

    await expect(service.status('INF-1', { ...PESV, id: 2 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });
});

describe('ExternalEnrollmentsService · espera', () => {
  it('sin curso elegido para la infracción, espera, no crea cuenta y avisa a los administradores', async () => {
    const { service, accountsCreated, mail, notifications } = campus();

    const { created, view } = await service.receive(request(), PESV);

    expect(created).toBe(true);
    expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_ASSIGNED', course: null });
    expect(view.detail).toContain('infracción C29');
    expect(accountsCreated).toEqual([]);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userGuid: 'admin',
        type: 'ENROLLMENT_WAITING',
        title: 'Matrículas en espera: infracción C29',
        actionUrl: '/dashboard/admin/integrations',
      }),
    );
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledWith(
      'admin@pesv.test',
      'Admin',
      {
        infraction: 'C29 (Exceso de velocidad)',
        people: '1 persona',
        reason: 'todavía no se ha elegido el curso que la atiende',
        fix: 'elige en Integraciones el curso que la atiende',
      },
      'COLOMBIA',
    );
  });

  it('el aviso dice qué hacer según lo que falte: publicar el curso o ampliar su cupo', async () => {
    const draft = campus({ courses: [course({ status: 'DRAFT' })], infractions: [C29()] });
    await draft.service.receive(request(), PESV);
    const full = campus({ courses: [course({ maxStudents: 1, occupied: 1 })], infractions: [C29()] });
    await full.service.receive(request(), PESV);

    const fixOf = (mail: typeof draft.mail) => (mail.sendEnrollmentWaiting.mock.calls[0] as unknown[])[2];
    expect(fixOf(draft.mail)).toMatchObject({ fix: 'publica su curso' });
    expect(fixOf(full.mail)).toMatchObject({ fix: 'amplía el cupo de su curso' });
  });

  it('un correo que tarda no retiene la respuesta al otro sistema', async () => {
    const { service, mail } = campus();
    mail.sendEnrollmentWaiting.mockImplementation(() => new Promise<undefined>(() => undefined));

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('WAITING');
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(1);
  });

  it('cien solicitudes por la misma infracción en un día dan un solo aviso, y se recuerda al día siguiente', async () => {
    const { service, waiting, mail, advanceHours } = campus();

    for (let i = 1; i <= 100; i++)
      await service.receive(request({ externalId: `INF-${i}`, email: `p${i}@empresa.com` }), PESV);
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(1);

    advanceHours(25);
    await waiting.attendAll();
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(2);
    expect(mail.sendEnrollmentWaiting).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ people: '100 personas' }),
      'COLOMBIA',
    );
  });

  it('cada infracción tiene su propio aviso', async () => {
    const { service, mail } = campus();

    await service.receive(request(), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'beto@empresa.com', infractionCode: 'C35' }), PESV);

    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(2);
  });

  it('si su curso está en borrador, espera a que se publique', async () => {
    const { service } = campus({ courses: [course({ status: 'DRAFT' })], infractions: [C29()] });

    const { view } = await service.receive(request(), PESV);

    expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_PUBLISHED' });
  });

  it('al publicarse su curso se matriculan todas, por orden de llegada', async () => {
    const { service, waiting, courses, enrollFromIntegration } = campus({
      courses: [course({ status: 'DRAFT' })],
      infractions: [C29()],
    });
    await service.receive(request({ externalId: 'INF-1', email: 'uno@empresa.com' }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'dos@empresa.com' }), PESV);

    courses[0].status = 'PUBLISHED';
    await waiting.attendCourse('curso-1', 'COLOMBIA');

    expect(enrollFromIntegration.mock.calls.map(([, student]) => student.email)).toEqual([
      'uno@empresa.com',
      'dos@empresa.com',
    ]);
    await expect(service.status('INF-2', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });

  it('sin plaza esperan, y entran las que caben cuando se libera', async () => {
    const { service, waiting, courses, enrollFromIntegration } = campus({
      courses: [course({ maxStudents: 1, occupied: 1 })],
      infractions: [C29()],
    });
    for (const id of ['INF-1', 'INF-2']) {
      const { view } = await service.receive(request({ externalId: id, email: `${id}@empresa.com` }), PESV);
      expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_FULL' });
    }

    courses[0].occupied = 0;
    await waiting.attendAll();

    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
    await expect(service.status('INF-2', PESV)).resolves.toMatchObject({
      status: 'WAITING',
      waitingReason: 'COURSE_FULL',
    });
  });

  it('un curso lleno no detiene a quien ya lo está cursando: sigue en él sin ocupar otra plaza', async () => {
    const { service, courses } = campus({ courses: [course({ maxStudents: 1 })], infractions: [C29()] });
    await service.receive(request(), PESV);

    const { view } = await service.receive(request({ externalId: 'INF-2' }), PESV);

    expect(view).toMatchObject({ status: 'ENROLLED', waitingReason: null });
    expect(courses[0].occupied).toBe(1);
  });

  it('dos pasadas a la vez no matriculan dos veces a la misma persona', async () => {
    const { service, waiting, courses, enrollFromIntegration } = campus({
      courses: [course({ status: 'DRAFT' })],
      infractions: [C29()],
    });
    await service.receive(request(), PESV);
    courses[0].status = 'PUBLISHED';

    await Promise.all([waiting.attendCourse('curso-1', 'COLOMBIA'), waiting.attendAll(), waiting.attendAll()]);

    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });

  it('si mientras esperaba su correo pasó a ser de otra sede, se rechaza y lo dice', async () => {
    const { service, waiting, courses, prisma } = campus({
      courses: [course({ status: 'DRAFT' })],
      infractions: [C29()],
    });
    await service.receive(request(), PESV);
    prisma.user.findUnique = async () => ({
      guid: 'mx',
      email: 'ana@empresa.com',
      firstName: 'Ana',
      role: 'STUDENT',
      country: 'MEXICO',
    });

    courses[0].status = 'PUBLISHED';
    await waiting.attendCourse('curso-1', 'COLOMBIA');

    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({
      status: 'REJECTED',
      detail: 'El correo pertenece a una cuenta que no puede matricularse en esta sede.',
    });
  });
});

describe('ExternalEnrollmentsService · curso por el título', () => {
  it('si un curso publicado lleva el código de la infracción, la atiende sin que nadie lo elija', async () => {
    const { service, infractions, enrollFromIntegration } = campus({
      courses: [course({ title: 'C-29 Exceso de velocidad' }), course({ guid: 'curso-2', title: 'Seguridad vial' })],
    });

    const { view } = await service.receive(request(), PESV);

    expect(view).toMatchObject({ status: 'ENROLLED', course: { title: 'C-29 Exceso de velocidad' } });
    expect(infractions[0]).toMatchObject({ courseGuid: 'curso-1', autoAssigned: true });
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });

  it('también si su título dice lo mismo que la descripción', async () => {
    const { service, infractions } = campus({ courses: [course({ title: 'Exceso de velocidad' })] });

    const { view } = await service.receive(request({ infractionCode: 'C35' }), PESV);

    expect(view.status).toBe('ENROLLED');
    expect(infractions[0]).toMatchObject({ code: 'C35', courseGuid: 'curso-1', autoAssigned: true });
  });

  it('en la duda no elige: espera a que lo haga un administrador', async () => {
    const { service, infractions, notifications } = campus({
      courses: [course({ title: 'C29 Teoría' }), course({ guid: 'curso-2', title: 'C29 Práctica' })],
    });

    const { view } = await service.receive(request(), PESV);

    expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_ASSIGNED' });
    expect(infractions[0].courseGuid).toBeNull();
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('un borrador no se elige; al publicarlo, entran quienes esperaban por su infracción', async () => {
    const { service, waiting, courses, infractions } = campus({
      courses: [course({ title: 'C29 Exceso de velocidad', status: 'DRAFT' })],
    });
    await service.receive(request(), PESV);
    expect(infractions[0].courseGuid).toBeNull();

    courses[0].status = 'PUBLISHED';
    await waiting.attendCourse('curso-1', 'COLOMBIA');

    expect(infractions[0]).toMatchObject({ courseGuid: 'curso-1', autoAssigned: true });
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });

  it('el curso que elige un administrador manda y deja de contar como elegido por el título', async () => {
    const { service, infractionCatalog, infractions } = campus({
      courses: [course({ title: 'C29' }), course({ guid: 'curso-2', title: 'Manejo defensivo' })],
    });
    await service.receive(request(), PESV);

    await infractionCatalog.assignCourse(1, 'curso-2', 'COLOMBIA');

    expect(infractions[0]).toMatchObject({ courseGuid: 'curso-2', autoAssigned: false });
    await expect(infractionCatalog.list('COLOMBIA')).resolves.toEqual([
      expect.objectContaining({ course: expect.objectContaining({ guid: 'curso-2' }), autoAssigned: false }),
    ]);
  });
});

describe('InfractionsService · panel del administrador', () => {
  it('lista primero las infracciones con alguien esperando, con el motivo y quién lo pidió', async () => {
    const { service, infractionCatalog } = campus({
      courses: [course()],
      infractions: [{ ...C29(), id: 1, code: 'A01' }],
    });
    await service.receive(request({ externalId: 'INF-1', email: 'uno@empresa.com', infractionCode: 'C35' }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'dos@empresa.com', infractionCode: 'C35' }), PESV);

    const [first, second] = await infractionCatalog.list('COLOMBIA');

    expect(first).toMatchObject({ code: 'C35', course: null, reason: 'COURSE_NOT_ASSIGNED' });
    expect(first.waiting.map((r) => [r.email, r.system])).toEqual([
      ['uno@empresa.com', 'Software PESV'],
      ['dos@empresa.com', 'Software PESV'],
    ]);
    expect(second).toMatchObject({ code: 'A01', course: { title: 'Manejo defensivo' }, reason: null, waiting: [] });
  });

  it('elegir el curso de una infracción matricula en el acto a quienes esperaban, y a los que lleguen', async () => {
    const { service, infractionCatalog, rows, enrollFromIntegration } = campus({ courses: [course()] });
    await service.receive(request({ externalId: 'INF-1', email: 'uno@empresa.com' }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'dos@empresa.com' }), PESV);

    await expect(infractionCatalog.assignCourse(1, 'curso-1', 'COLOMBIA')).resolves.toEqual({
      message: 'Las solicitudes por esta infracción se matricularán en «Manejo defensivo».',
    });
    const { view } = await service.receive(request({ externalId: 'INF-3', email: 'tres@empresa.com' }), PESV);

    expect(rows.map((row) => row.status)).toEqual(['ENROLLED', 'ENROLLED', 'ENROLLED']);
    expect(view.status).toBe('ENROLLED');
    expect(enrollFromIntegration).toHaveBeenCalledTimes(3);
  });

  it('al elegir un curso lleno entra quien ya lo cursaba, aunque otros esperen plaza delante', async () => {
    const { service, infractionCatalog, rows, enroll } = campus({
      courses: [course({ maxStudents: 1 })],
      users: [ADMIN, ANA],
    });
    enroll(ANA.email, 'curso-1');
    await service.receive(request({ externalId: 'INF-1', email: 'pedro@empresa.com', firstName: 'Pedro' }), PESV);
    await service.receive(request({ externalId: 'INF-2' }), PESV);

    await infractionCatalog.assignCourse(1, 'curso-1', 'COLOMBIA');

    expect(rows.map((row) => row.status)).toEqual(['WAITING', 'ENROLLED']);
  });

  it('no se elige un curso de otra sede, ni para una infracción de otra sede', async () => {
    const { infractionCatalog, infractions } = campus({
      courses: [course(), course({ guid: 'curso-mx', country: 'MEXICO' })],
      infractions: [C29(null)],
    });

    await expect(infractionCatalog.assignCourse(1, 'curso-mx', 'COLOMBIA')).rejects.toBeInstanceOf(NotFoundException);
    await expect(infractionCatalog.assignCourse(1, 'curso-mx', 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
    expect(infractions[0].courseGuid).toBeNull();
  });

  it('descartar una solicitud la saca de la espera y el otro sistema la ve rechazada', async () => {
    const { service, waiting, rows } = campus();
    await service.receive(request(), PESV);

    await waiting.discard(rows[0].guid as string, 'COLOMBIA');

    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'REJECTED' });
    await expect(waiting.discard(rows[0].guid as string, 'COLOMBIA')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no se descarta una solicitud de otra sede', async () => {
    const { service, waiting, rows } = campus();
    await service.receive(request(), PESV);

    await expect(waiting.discard(rows[0].guid as string, 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExternalEnrollmentsService · finalización', () => {
  it('completada, contesta con el certificado y el enlace para verificarlo', async () => {
    const { service, rows } = campus({ courses: [course()], infractions: [C29()] });
    await service.receive(request(), PESV);
    Object.assign(rows[0], {
      status: 'COMPLETED',
      certificate: { verificationCode: 'CERT-9', completedAt: new Date('2026-10-20'), validUntil: null },
    });

    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({
      status: 'COMPLETED',
      certificate: {
        code: 'CERT-9',
        verificationUrl: 'https://campus.test/verify?code=CERT-9',
        issuedAt: new Date('2026-10-20'),
        validUntil: null,
      },
    });
  });
});

describe('ExternalEnrollmentsService · curso ya completado', () => {
  it('si lo completó después de pedirse (la matricularon a mano), la solicitud se cumple sin repetirlo', async () => {
    const { service, infractionCatalog, rows, enroll, certify, enrollFromIntegration } = campus({
      courses: [course()],
      users: [ADMIN, ANA],
    });
    await service.receive(request(), PESV);
    enroll(ANA.email, 'curso-1');
    certify(ANA.email, 'curso-1');

    await infractionCatalog.assignCourse(1, 'curso-1', 'COLOMBIA');

    expect(rows[0]).toMatchObject({ status: 'COMPLETED', certificateGuid: 'cert-1', userGuid: 'ana' });
    expect(enrollFromIntegration).not.toHaveBeenCalled();
  });

  it('un certificado de antes de la infracción no la cumple: vuelve a hacer el curso', async () => {
    const { service, enroll, certify, enrollFromIntegration } = campus({
      courses: [course()],
      users: [ADMIN, ANA],
      infractions: [C29()],
    });
    enroll(ANA.email, 'curso-1');
    certify(ANA.email, 'curso-1');

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('ENROLLED');
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalEnrollmentsService · retirada por el sistema que la pidió', () => {
  it('una solicitud en espera se retira: deja de esperar y queda rechazada, también al repetirlo', async () => {
    const { service, infractionCatalog } = campus();
    await service.receive(request(), PESV);

    const withdrawn = await service.withdraw('INF-1', PESV);
    const again = await service.withdraw('INF-1', PESV);

    expect(withdrawn).toMatchObject({ status: 'REJECTED', detail: 'La retiró el sistema que la envió.' });
    expect(again).toEqual(withdrawn);
    await expect(infractionCatalog.list('COLOMBIA')).resolves.toEqual([expect.objectContaining({ waiting: [] })]);
  });

  it('una ya atendida no se retira: la matrícula sigue su curso', async () => {
    const { service } = campus({ courses: [course()], infractions: [C29()] });
    await service.receive(request(), PESV);

    await expect(service.withdraw('INF-1', PESV)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });

  it('sólo retira las suyas', async () => {
    const { service } = campus();
    await service.receive(request(), PESV);

    await expect(service.withdraw('INF-1', { ...PESV, id: 2 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
