import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExternalEnrollmentsService } from './external-enrollments.service';
import { CourseFullException } from '../enrollments/course-capacity';
import type { IntegrationCaller } from './integration-auth';

/**
 * Matrículas que piden otros sistemas.
 *
 * El caso que las motiva: el sistema del PESV bloquea a un conductor por una infracción y pide que
 * haga un curso; sólo vuelve a habilitarlo cuando lo termina. Aquí se fija que la persona quede
 * matriculada una sola vez, que espere si el curso aún no existe y que los administradores se
 * enteren sin recibir un correo por solicitud.
 */

const PESV: IntegrationCaller = { id: 1, name: 'Software PESV', country: 'COLOMBIA' };

interface CourseRow {
  guid: string;
  country: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  integrationCode: string | null;
  maxStudents: number | null;
  occupied: number;
  teacherGuid: string;
  passingScore: number;
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
  integrationCode: 'MANEJO',
  maxStudents: null,
  occupied: 0,
  teacherGuid: 'profe',
  passingScore: 80,
  ...fields,
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

const request = (fields: Partial<Record<string, string>> = {}) => ({
  externalId: 'INF-1',
  courseCode: 'MANEJO',
  firstName: 'Ana',
  lastName: 'Ramírez',
  email: 'ana@empresa.com',
  ...fields,
});

/** El campus en memoria: sólo lo que consultan las matrículas externas. */
function campus({ courses = [] as CourseRow[], users = [ADMIN] as UserRow[] } = {}) {
  const rows: Record<string, unknown>[] = [];
  const enrollments = new Map<string, { active: boolean; enrolledAt: Date; completedAt: Date | null }>();
  const certificates: { guid: string; userGuid: string; courseGuid: string; completedAt: Date }[] = [];
  const accountOf = (email: string) => users.find((u) => u.email === email);
  let clock = Date.parse('2026-10-01T08:00:00Z');
  jest.setSystemTime(clock);

  const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([field, expected]) => {
      if (expected && typeof expected === 'object' && 'gte' in expected) {
        return row[field] instanceof Date && (row[field] as Date) >= (expected as { gte: Date }).gte;
      }
      return row[field] === expected;
    });
  const view = (row: Record<string, unknown>) => ({
    ...row,
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
    course: {
      findUnique: async ({ where }: { where: Record<string, any> }) => {
        const found = where.country_integrationCode
          ? courses.find(
              (c) =>
                c.country === where.country_integrationCode.country &&
                c.integrationCode === where.country_integrationCode.integrationCode,
            )
          : courses.find((c) => c.guid === where.guid);
        return found ?? null;
      },
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

  const service = new ExternalEnrollmentsService(
    prisma as never,
    userService as never,
    enrollmentService as never,
    mail as never,
    notifications as never,
    realtime as never,
    config as never,
  );
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(service['logger'], level).mockImplementation(() => undefined);
  }

  return {
    service,
    rows,
    courses,
    users,
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
  it('con el curso publicado, crea la cuenta, matricula y contesta 201 con el enlace del curso', async () => {
    const { service, accountsCreated, enrollFromIntegration } = campus({ courses: [course()] });

    const { created, view } = await service.receive(request(), PESV);

    expect(created).toBe(true);
    expect(accountsCreated).toEqual(['ana@empresa.com']);
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
    expect(view).toMatchObject({
      externalId: 'INF-1',
      status: 'ENROLLED',
      courseCode: 'MANEJO',
      course: { title: 'Manejo defensivo', url: 'https://campus.test/courses/curso-1' },
      enrolledAt: expect.any(Date),
      certificate: null,
    });
  });

  it('quien ya tiene cuenta de estudiante en la sede entra con ella', async () => {
    const { service, accountsCreated, enrollFromIntegration } = campus({ courses: [course()], users: [ADMIN, ANA] });

    await service.receive(request(), PESV);

    expect(accountsCreated).toEqual([]);
    expect(enrollFromIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ guid: 'curso-1' }),
      expect.objectContaining({ guid: 'ana' }),
    );
  });

  it('repetir el envío devuelve la misma solicitud (200) sin matricular otra vez', async () => {
    const { service, enrollFromIntegration, rows } = campus({ courses: [course()] });

    await service.receive(request(), PESV);
    const retry = await service.receive(request(), PESV);

    expect(retry.created).toBe(false);
    expect(retry.view.status).toBe('ENROLLED');
    expect(rows).toHaveLength(1);
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });

  it('reutilizar el identificador para otra persona o curso es un error del otro sistema', async () => {
    const { service } = campus({ courses: [course()] });
    await service.receive(request(), PESV);

    await expect(service.receive(request({ courseCode: 'OTRO' }), PESV)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.receive(request({ email: 'beto@empresa.com' }), PESV)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('un correo de otra sede o del personal no se matricula ni deja solicitud', async () => {
    const mexican: UserRow = {
      guid: 'mx',
      email: 'ana@empresa.com',
      firstName: 'Ana',
      role: 'STUDENT',
      country: 'MEXICO',
    };
    const fromMexico = campus({ courses: [course()], users: [ADMIN, mexican] });
    await expect(fromMexico.service.receive(request(), PESV)).rejects.toBeInstanceOf(ConflictException);
    expect(fromMexico.rows).toHaveLength(0);

    const staff = campus({ courses: [course()] });
    await expect(staff.service.receive(request({ email: ADMIN.email }), PESV)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(staff.rows).toHaveLength(0);
  });

  it('si la cuenta se crea a la vez por otra vía, entra con esa en lugar de fallar', async () => {
    const { service, users, createUser } = campus({ courses: [course()] });
    createUser.mockImplementationOnce(async () => {
      users.push(ANA);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7' });
    });

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('ENROLLED');
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('sólo se consulta lo que pidió el mismo sistema', async () => {
    const { service } = campus({ courses: [course()] });
    await service.receive(request(), PESV);

    await expect(service.status('INF-1', { ...PESV, id: 2 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });
});

describe('ExternalEnrollmentsService · espera de un curso', () => {
  it('sin curso con ese código, espera, no crea cuenta y avisa a los administradores', async () => {
    const { service, accountsCreated, mail, notifications } = campus();

    const { created, view } = await service.receive(request(), PESV);

    expect(created).toBe(true);
    expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_FOUND', course: null });
    expect(accountsCreated).toEqual([]);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userGuid: 'admin',
        type: 'ENROLLMENT_WAITING',
        actionUrl: '/dashboard/admin/integrations',
      }),
    );
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledWith(
      'admin@pesv.test',
      'Admin',
      {
        courseCode: 'MANEJO',
        people: '1 persona',
        reason: 'todavía no hay ningún curso con ese código',
        fix: expect.stringContaining('escribe el código en el campo «Código de integración»'),
      },
      'COLOMBIA',
    );
  });

  it('el aviso dice qué hacer según lo que falte: publicar el curso o ampliar su cupo', async () => {
    const draft = campus({ courses: [course({ status: 'DRAFT' })] });
    await draft.service.receive(request(), PESV);
    const full = campus({ courses: [course({ maxStudents: 1, occupied: 1 })] });
    await full.service.receive(request(), PESV);

    const fixOf = (mail: typeof draft.mail) => (mail.sendEnrollmentWaiting.mock.calls[0] as unknown[])[2];
    expect(fixOf(draft.mail)).toMatchObject({ fix: 'publica el curso que lleva ese código' });
    expect(fixOf(full.mail)).toMatchObject({ fix: 'amplía el cupo del curso que lleva ese código' });
  });

  it('un correo que tarda no retiene la respuesta al otro sistema', async () => {
    const { service, mail } = campus();
    mail.sendEnrollmentWaiting.mockImplementation(() => new Promise<undefined>(() => undefined));

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('WAITING');
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(1);
  });

  it('cien solicitudes del mismo curso en un día dan un solo aviso, y se recuerda al día siguiente', async () => {
    const { service, mail, advanceHours } = campus();

    for (let i = 1; i <= 100; i++)
      await service.receive(request({ externalId: `INF-${i}`, email: `p${i}@empresa.com` }), PESV);
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(1);

    advanceHours(25);
    await service.attendAllWaiting();
    expect(mail.sendEnrollmentWaiting).toHaveBeenCalledTimes(2);
    expect(mail.sendEnrollmentWaiting).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ people: '100 personas' }),
      'COLOMBIA',
    );
  });

  it('un curso en borrador con ese código también la hace esperar', async () => {
    const { service } = campus({ courses: [course({ status: 'DRAFT' })] });

    const { view } = await service.receive(request(), PESV);

    expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_PUBLISHED' });
  });

  it('al abrirse el curso se matriculan todas, por orden de llegada', async () => {
    const { service, courses, enrollFromIntegration } = campus({ courses: [course({ status: 'DRAFT' })] });
    await service.receive(request({ externalId: 'INF-1', email: 'uno@empresa.com' }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'dos@empresa.com' }), PESV);

    courses[0].status = 'PUBLISHED';
    await service.attendCourse('curso-1');

    expect(enrollFromIntegration.mock.calls.map(([, student]) => student.email)).toEqual([
      'uno@empresa.com',
      'dos@empresa.com',
    ]);
    await expect(service.status('INF-2', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
  });

  it('sin plaza esperan, y entran las que caben cuando se libera', async () => {
    const { service, courses, enrollFromIntegration } = campus({ courses: [course({ maxStudents: 1, occupied: 1 })] });
    for (const id of ['INF-1', 'INF-2']) {
      const { view } = await service.receive(request({ externalId: id, email: `${id}@empresa.com` }), PESV);
      expect(view).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_FULL' });
    }

    courses[0].occupied = 0;
    await service.attendAllWaiting();

    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'ENROLLED' });
    await expect(service.status('INF-2', PESV)).resolves.toMatchObject({
      status: 'WAITING',
      waitingReason: 'COURSE_FULL',
    });
  });

  it('un curso lleno no detiene a quien ya lo está cursando: sigue en él sin ocupar otra plaza', async () => {
    const { service, courses } = campus({ courses: [course({ maxStudents: 1 })] });
    await service.receive(request(), PESV);

    const { view } = await service.receive(request({ externalId: 'INF-2' }), PESV);

    expect(view).toMatchObject({ status: 'ENROLLED', waitingReason: null });
    expect(courses[0].occupied).toBe(1);
  });

  it('al abrirse un curso lleno entra quien ya lo cursaba, aunque otros esperen plaza delante', async () => {
    const { service, rows, courses, enroll } = campus({
      courses: [course({ integrationCode: null, maxStudents: 1 })],
      users: [ADMIN, ANA],
    });
    enroll(ANA.email, 'curso-1');
    await service.receive(request({ externalId: 'INF-1', email: 'pedro@empresa.com', firstName: 'Pedro' }), PESV);
    await service.receive(request({ externalId: 'INF-2' }), PESV);

    courses[0].integrationCode = 'MANEJO';
    await service.attendCourse('curso-1');

    expect(rows.map((row) => row.status)).toEqual(['WAITING', 'ENROLLED']);
  });

  it('dos pasadas a la vez no matriculan dos veces a la misma persona', async () => {
    const { service, courses, enrollFromIntegration } = campus({ courses: [course({ status: 'DRAFT' })] });
    await service.receive(request(), PESV);
    courses[0].status = 'PUBLISHED';

    await Promise.all([service.attendCourse('curso-1'), service.attendAllWaiting(), service.attendAllWaiting()]);

    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });

  it('si mientras esperaba su correo pasó a ser de otra sede, se rechaza y lo dice', async () => {
    const { service, courses } = campus({ courses: [course({ status: 'DRAFT' })] });
    await service.receive(request(), PESV);
    const harness = service as unknown as { prisma: { user: { findUnique: () => Promise<unknown> } } };
    harness.prisma.user.findUnique = async () => ({
      guid: 'mx',
      email: 'ana@empresa.com',
      role: 'STUDENT',
      country: 'MEXICO',
    });

    courses[0].status = 'PUBLISHED';
    await service.attendCourse('curso-1');

    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({
      status: 'REJECTED',
      detail: 'El correo pertenece a una cuenta que no puede matricularse en esta sede.',
    });
  });
});

describe('ExternalEnrollmentsService · panel del administrador', () => {
  it('agrupa por código lo que espera, con el motivo y quién lo pidió', async () => {
    const { service } = campus({ courses: [course({ integrationCode: 'OTRO' })] });
    await service.receive(request({ externalId: 'INF-1', email: 'uno@empresa.com' }), PESV);
    await service.receive(request({ externalId: 'INF-2', email: 'dos@empresa.com' }), PESV);

    const [group] = await service.waitingByCourse('COLOMBIA');

    expect(group).toMatchObject({ courseCode: 'MANEJO', course: null, reason: 'COURSE_NOT_FOUND' });
    expect(group.requests.map((r) => [r.email, r.system])).toEqual([
      ['uno@empresa.com', 'Software PESV'],
      ['dos@empresa.com', 'Software PESV'],
    ]);
  });

  it('descartar una solicitud la saca de la espera y el otro sistema la ve rechazada', async () => {
    const { service, rows } = campus();
    await service.receive(request(), PESV);

    await service.discard(rows[0].guid as string, 'COLOMBIA');

    await expect(service.status('INF-1', PESV)).resolves.toMatchObject({ status: 'REJECTED' });
    await expect(service.discard(rows[0].guid as string, 'COLOMBIA')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no se descarta una solicitud de otra sede', async () => {
    const { service, rows } = campus();
    await service.receive(request(), PESV);

    await expect(service.discard(rows[0].guid as string, 'MEXICO')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExternalEnrollmentsService · finalización', () => {
  it('completada, contesta con el certificado y el enlace para verificarlo', async () => {
    const { service, rows } = campus({ courses: [course()] });
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
    const { service, rows, courses, enroll, certify, enrollFromIntegration } = campus({
      courses: [course({ integrationCode: null })],
      users: [ADMIN, ANA],
    });
    await service.receive(request(), PESV);
    enroll(ANA.email, 'curso-1');
    certify(ANA.email, 'curso-1');

    courses[0].integrationCode = 'MANEJO';
    await service.attendCourse('curso-1');

    expect(rows[0]).toMatchObject({ status: 'COMPLETED', certificateGuid: 'cert-1', userGuid: 'ana' });
    expect(enrollFromIntegration).not.toHaveBeenCalled();
  });

  it('un certificado de antes de la infracción no la cumple: vuelve a hacer el curso', async () => {
    const { service, enroll, certify, enrollFromIntegration } = campus({ courses: [course()], users: [ADMIN, ANA] });
    enroll(ANA.email, 'curso-1');
    certify(ANA.email, 'curso-1');

    const { view } = await service.receive(request(), PESV);

    expect(view.status).toBe('ENROLLED');
    expect(enrollFromIntegration).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalEnrollmentsService · retirada por el sistema que la pidió', () => {
  it('una solicitud en espera se retira: deja de esperar y queda rechazada, también al repetirlo', async () => {
    const { service } = campus();
    await service.receive(request(), PESV);

    const withdrawn = await service.withdraw('INF-1', PESV);
    const again = await service.withdraw('INF-1', PESV);

    expect(withdrawn).toMatchObject({ status: 'REJECTED', detail: 'La retiró el sistema que la envió.' });
    expect(again).toEqual(withdrawn);
    await expect(service.waitingByCourse('COLOMBIA')).resolves.toEqual([]);
  });

  it('una ya atendida no se retira: la matrícula sigue su curso', async () => {
    const { service } = campus({ courses: [course()] });
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
