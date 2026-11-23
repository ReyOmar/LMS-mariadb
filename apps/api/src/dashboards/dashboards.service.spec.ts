import { DashboardsService } from './dashboards.service';

/**
 * Resumen del panel de administración de una sede.
 *
 * Las cifras tienen que salir de la base sobre la sede entera: ni de una muestra de filas
 * ni mezclando matrículas dadas de baja con las vigentes.
 */
interface Answers {
  accountsByRole?: unknown[];
  coursesByStatus?: unknown[];
  average?: number | string | null;
  newUsers?: number;
  newEnrollments?: number;
  certificates?: unknown[];
  enrollments?: unknown[];
  submissions?: unknown[];
  accounts?: unknown[];
}

function serviceWith(answers: Answers = {}) {
  const calls: {
    usersWhere?: unknown;
    coursesWhere?: unknown;
    rawSql: string[];
    newUsersWhere?: { createdAt: { gte: Date } };
    enrollmentCounts: { where: Record<string, unknown> }[];
    eventQueries: Record<string, { where: Record<string, unknown>; take: number }>;
  } = { rawSql: [], enrollmentCounts: [], eventQueries: {} };
  const events =
    (name: string, rows: unknown[] = []) =>
    async (query: { where: Record<string, unknown>; take: number }) => {
      calls.eventQueries[name] = query;
      return rows;
    };

  const prisma = {
    user: {
      groupBy: async ({ where }: { where: unknown }) => {
        calls.usersWhere = where;
        return answers.accountsByRole ?? [];
      },
      count: async ({ where }: { where: { createdAt: { gte: Date } } }) => {
        calls.newUsersWhere = where;
        return answers.newUsers ?? 0;
      },
      findMany: events('accounts', answers.accounts),
    },
    course: {
      groupBy: async ({ where }: { where: unknown }) => {
        calls.coursesWhere = where;
        return answers.coursesByStatus ?? [];
      },
    },
    accessRequest: { count: async () => 2 },
    enrollment: {
      count: async (query: { where: Record<string, unknown> }) => {
        calls.enrollmentCounts.push(query);
        return query.where.enrolledAt ? (answers.newEnrollments ?? 0) : 0;
      },
      findMany: events('enrollments', answers.enrollments),
    },
    certificate: { findMany: events('certificates', answers.certificates) },
    submission: { findMany: events('submissions', answers.submissions) },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join('?');
      calls.rawSql.push(sql);
      return sql.includes('AVG(best)') ? [{ average: answers.average ?? null }] : [];
    },
  };
  const settings = { getSettings: async () => ({ timeZone: 'America/Bogota' }) };

  return { service: new DashboardsService(prisma as never, settings as never), calls };
}

describe('DashboardsService · resumen de la sede', () => {
  it('los usuarios totales son todas las cuentas de la sede, de cualquier rol', async () => {
    const { service, calls } = serviceWith({
      accountsByRole: [
        { role: 'STUDENT', _count: { _all: 120 } },
        { role: 'TEACHER', _count: { _all: 7 } },
        { role: 'ADMIN', _count: { _all: 2 } },
      ],
    });

    const { users } = await service.getCountrySummary('COLOMBIA');

    expect(calls.usersWhere).toEqual({ country: 'COLOMBIA' });
    expect(users).toEqual({ total: 129, students: 120, teachers: 7, admins: 2, newThisMonth: 0 });
  });

  it('incluye las solicitudes de acceso pendientes', async () => {
    const { service } = serviceWith({ accountsByRole: [] });

    expect((await service.getCountrySummary('COLOMBIA')).pendingRequests).toBe(2);
  });

  it('un rol sin cuentas cuenta cero', async () => {
    const { service } = serviceWith({ accountsByRole: [{ role: 'ADMIN', _count: { _all: 1 } }] });

    const { users } = await service.getCountrySummary('MEXICO');

    expect(users).toEqual({ total: 1, students: 0, teachers: 0, admins: 1, newThisMonth: 0 });
  });

  it('el promedio lo calcula la base con la mejor nota de cada alumno en cada evaluación', async () => {
    // MariaDB devuelve AVG como texto decimal.
    const { service, calls } = serviceWith({ average: '83.4560' });

    const { overallAverage } = await service.getCountrySummary('COLOMBIA');

    expect(overallAverage).toBe(83.46);
    const average = calls.rawSql.find((sql) => sql.includes('AVG(best)'));
    expect(average).toContain('MAX(e.calificacion)');
    expect(average).toContain('GROUP BY e.usuario_guid, e.tarea_guid');
    expect(average).toContain('u.pais = ?');
  });

  it('cuenta los cursos de cualquier estado de la sede, también los archivados de julio', async () => {
    const { service, calls } = serviceWith({
      coursesByStatus: [
        { status: 'PUBLISHED', _count: { _all: 4 } },
        { status: 'DRAFT', _count: { _all: 2 } },
        { status: 'ARCHIVED', _count: { _all: 1 } },
      ],
    });

    const { courses } = await service.getCountrySummary('COLOMBIA');

    expect(calls.coursesWhere).toEqual({ country: 'COLOMBIA' });
    expect(courses).toEqual({ published: 4, draft: 2, total: 7 });
  });

  it('sin notas no hay promedio', async () => {
    const { service } = serviceWith({ average: null });

    expect((await service.getCountrySummary('COLOMBIA')).overallAverage).toBeNull();
  });

  it('el reparto por curso sólo cuenta matrículas activas', async () => {
    const { service, calls } = serviceWith();

    await service.getCountrySummary('COLOMBIA');

    const breakdown = calls.rawSql.find((sql) => sql.includes('lms_matriculas'));
    expect(breakdown).toContain('m.activa = 1');
  });
});

/**
 * Las novedades del panel: lo que cambió este mes y esta semana, y lo último que pasó.
 * No hay un registro de actividad aparte; todo sale de fechas que la base ya guarda.
 */
describe('DashboardsService · novedades de la sede', () => {
  afterEach(() => jest.useRealTimers());

  it('las cuentas nuevas del mes cuentan desde el día 1 a medianoche de la sede', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-20T15:00:00Z'), doNotFake: ['setTimeout', 'setImmediate'] });
    const { service, calls } = serviceWith({ newUsers: 3 });

    const { users } = await service.getCountrySummary('COLOMBIA');

    expect(users.newThisMonth).toBe(3);
    expect(calls.newUsersWhere?.createdAt.gte.toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('las matrículas nuevas son las vigentes de la semana de las gráficas', async () => {
    const { service, calls } = serviceWith({ newEnrollments: 5 });

    const { newEnrollments } = await service.getCountrySummary('COLOMBIA');

    expect(newEnrollments).toBe(5);
    const weekly = calls.enrollmentCounts.find((query) => query.where.enrolledAt);
    expect(weekly?.where).toMatchObject({ active: true, course: { country: 'COLOMBIA' } });
  });

  it('la semana trae también las cuentas creadas cada día', async () => {
    const { service, calls } = serviceWith();

    const { weeklyActivity } = await service.getCountrySummary('COLOMBIA');

    expect(weeklyActivity).toHaveLength(7);
    expect(weeklyActivity.every((day) => day.users === 0)).toBe(true);
    const accounts = calls.rawSql.find((sql) => sql.includes('u.created_at >='));
    expect(accounts).toContain('u.pais = ?');
  });

  it('la actividad reciente mezcla las fuentes de la más nueva a la más vieja, ocho como mucho', async () => {
    const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
    const { service, calls } = serviceWith({
      certificates: [{ createdAt: at(18), holderName: 'Ana Díaz', courseTitle: 'Manejo defensivo' }],
      enrollments: [
        { enrolledAt: at(19), user: { firstName: 'Luis', lastName: 'Torres' }, course: { title: 'Normas' } },
      ],
      submissions: [
        { submittedAt: at(17), user: { firstName: 'Eva', lastName: 'Gil' }, assignment: { title: 'Informe' } },
        // Una entrega cuya tarea se borró no tiene de qué hablar.
        { submittedAt: at(16), user: { firstName: 'Eva', lastName: 'Gil' }, assignment: null },
      ],
      accounts: Array.from({ length: 8 }, (_, i) => ({
        createdAt: at(10 - i),
        firstName: `Persona ${i}`,
        lastName: '',
        role: 'STUDENT',
      })),
    });

    const { recentEvents } = await service.getCountrySummary('COLOMBIA');

    expect(recentEvents).toHaveLength(8);
    expect(recentEvents.slice(0, 4)).toEqual([
      { type: 'enrollment', at: at(19), person: 'Luis Torres', subject: 'Normas' },
      { type: 'certificate', at: at(18), person: 'Ana Díaz', subject: 'Manejo defensivo' },
      { type: 'submission', at: at(17), person: 'Eva Gil', subject: 'Informe' },
      { type: 'account', at: at(10), person: 'Persona 0', subject: 'STUDENT' },
    ]);
    // Cada fuente pide como mucho ocho filas, de su sede.
    expect(Object.values(calls.eventQueries).every((query) => query.take === 8)).toBe(true);
    expect(calls.eventQueries.certificates.where).toMatchObject({ country: 'COLOMBIA' });
    // Los intentos de cuestionario no son «entregas»: llenarían la lista.
    expect(calls.eventQueries.submissions.where).toMatchObject({ assignment: { quizConfig: null } });
  });
});
