import { DashboardsService } from './dashboards.service';

/**
 * Resumen del panel de administración de una sede.
 *
 * Las cifras tienen que salir de la base sobre la sede entera: ni de una muestra de filas
 * ni mezclando matrículas dadas de baja con las vigentes.
 */
function serviceWith(
  answers: { accountsByRole?: unknown[]; coursesByStatus?: unknown[]; average?: number | string | null } = {},
) {
  const calls: { usersWhere?: unknown; coursesWhere?: unknown; rawSql: string[] } = { rawSql: [] };

  const prisma = {
    user: {
      groupBy: async ({ where }: { where: unknown }) => {
        calls.usersWhere = where;
        return answers.accountsByRole ?? [];
      },
    },
    course: {
      groupBy: async ({ where }: { where: unknown }) => {
        calls.coursesWhere = where;
        return answers.coursesByStatus ?? [];
      },
    },
    accessRequest: { count: async () => 2 },
    enrollment: { count: async () => 0 },
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
    expect(users).toEqual({ total: 129, students: 120, teachers: 7, admins: 2 });
  });

  it('incluye las solicitudes de acceso pendientes', async () => {
    const { service } = serviceWith({ accountsByRole: [] });

    expect((await service.getCountrySummary('COLOMBIA')).pendingRequests).toBe(2);
  });

  it('un rol sin cuentas cuenta cero', async () => {
    const { service } = serviceWith({ accountsByRole: [{ role: 'ADMIN', _count: { _all: 1 } }] });

    const { users } = await service.getCountrySummary('MEXICO');

    expect(users).toEqual({ total: 1, students: 0, teachers: 0, admins: 1 });
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
