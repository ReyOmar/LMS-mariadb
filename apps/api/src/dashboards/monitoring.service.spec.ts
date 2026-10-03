import { NotFoundException } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

const COURSES = [
  { guid: 'c1', title: 'Curso 1', country: 'COLOMBIA', teacherGuid: 'profe' },
  { guid: 'c2', title: 'Curso 2', country: 'COLOMBIA', teacherGuid: 'otro-profe' },
  { guid: 'c3', title: 'Curso 3', country: 'COLOMBIA', teacherGuid: 'profe' },
  { guid: 'mx', title: 'Curso de México', country: 'MEXICO', teacherGuid: 'profe' },
];

const SESSION = { jti: 'j', iat: 0, exp: 0 };
const ADMIN: JwtPayload = { ...SESSION, sub: 'admin', email: 'a@x', role: 'ADMIN', country: 'COLOMBIA' };
const TEACHER: JwtPayload = { ...SESSION, sub: 'profe', email: 'p@x', role: 'TEACHER', country: 'COLOMBIA' };

/** Texto de la consulta cruda, para responder según lo que pide. */
const sqlOf = (parts: TemplateStringsArray) => parts.join(' ');

/**
 * Doble de Prisma para el monitoreo. `course.findMany` interpreta el `where`, que es
 * lo que decide el alcance; las consultas crudas se contestan por su contenido.
 */
function serviceWith(answers: { [key: string]: unknown[] } = {}) {
  const prisma = {
    course: {
      findMany: jest.fn(async ({ where }: { where: { country: string; teacherGuid?: string } }) =>
        COURSES.filter(
          (c) => c.country === where.country && (!where.teacherGuid || c.teacherGuid === where.teacherGuid),
        )
          .map(({ guid, title }) => ({ guid, title }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      ),
    },
    enrollment: {
      findUnique: jest.fn(async () => answers.enrollment?.[0] ?? null),
      findMany: jest.fn(async () => answers.pageEnrollments ?? []),
    },
    courseModule: { findMany: jest.fn(async () => answers.modules ?? []) },
    submission: { groupBy: jest.fn(async () => []) },
    $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const sql = sqlOf(parts);
      if (sql.includes('DAYOFWEEK')) return answers.logins ?? [];
      if (sql.includes('COUNT(DISTINCT e.usuario_guid)')) return [{ withSubmissions: 0n, total: 0n }];
      if (sql.includes('SELECT m.usuario_guid AS userGuid, m.curso_guid')) return answers.enrollments ?? [];
      if (sql.includes('AS submissions')) return answers.submissions ?? [];
      if (sql.includes('AS done')) return answers.doneByModule ?? [];
      if (sql.includes('AS total')) return answers.totals ?? [];
      if (sql.includes('ORDER BY u.created_at DESC')) return answers.page ?? [];
      throw new Error(`Consulta no prevista: ${sql.slice(0, 80)}`);
    }),
  };
  const settings = { getSettings: async () => ({ timeZone: 'America/Bogota' }) };
  const access = { managedCourse: jest.fn(async () => undefined) };

  const service = new MonitoringService(prisma as never, settings as never, access as never);
  return { service, prisma, access };
}

describe('MonitoringService', () => {
  it('el profesor sólo ve sus cursos y el administrador los de su sede, nunca los de otra', async () => {
    const { service } = serviceWith();

    const teacherSummary = await service.getSummary(TEACHER, {});
    const adminSummary = await service.getSummary(ADMIN, {});

    expect(teacherSummary.courses.map((c) => c.guid)).toEqual(['c1', 'c3']);
    expect(adminSummary.courses.map((c) => c.guid)).toEqual(['c1', 'c2', 'c3']);
  });

  it('un curso fuera de su alcance da 404 y no llega a consultar alumnos', async () => {
    const { service, prisma } = serviceWith();

    await expect(service.getSummary(TEACHER, { course: 'c2' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getStudents(TEACHER, { course: 'mx' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reparte por tramos con la media de los cursos de cada alumno', async () => {
    const { service } = serviceWith({
      // El avance de cada matrícula es su recuento guardado.
      enrollments: [
        { userGuid: 'ana', courseGuid: 'c1', done: 10n },
        { userGuid: 'ana', courseGuid: 'c3', done: 1n },
        { userGuid: 'luis', courseGuid: 'c1', done: 0n },
        { userGuid: 'eva', courseGuid: 'c3', done: 0n },
      ],
      // c3 no tiene recursos: cuenta como 0 % y no como una división por cero.
      totals: [{ courseGuid: 'c1', total: 20n }],
      logins: [
        { weekday: 2, students: 2n },
        { weekday: null, students: 1n },
      ],
    });

    const summary = await service.getSummary(ADMIN, {});

    // ana: (50 + 0) / 2 = 25 → primer tramo; luis 0 y eva 0 también.
    expect(summary.ranges).toEqual([3, 0, 0, 0]);
    expect(summary.students).toBe(3);
    expect(summary.loginsPerDay).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });

  it('con un curso elegido el tramo es el avance en ese curso', async () => {
    const { service } = serviceWith({
      enrollments: [{ userGuid: 'ana', courseGuid: 'c1', done: 16n }],
      totals: [{ courseGuid: 'c1', total: 20n }],
    });

    const summary = await service.getSummary(ADMIN, { course: 'c1' });

    expect(summary.ranges).toEqual([0, 0, 0, 1]); // 80 %
  });

  it('un recuento por encima del total —un recurso retirado antes de la reconciliación— se queda en 100 %', async () => {
    const { service } = serviceWith({
      enrollments: [{ userGuid: 'ana', courseGuid: 'c1', done: 25n }],
      totals: [{ courseGuid: 'c1', total: 20n }],
    });

    const summary = await service.getSummary(ADMIN, { course: 'c1' });

    expect(summary.ranges).toEqual([0, 0, 0, 1]);
  });

  it('cifras, lista y filas sólo cuentan matrículas en curso: quien se certificó no aparece', async () => {
    const { service, prisma } = serviceWith({
      page: [
        { guid: 'ana', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x', lastAccessAt: null, createdAt: new Date() },
      ],
    });

    await service.getSummary(ADMIN, {});
    await service.getStudents(ADMIN, {});

    // Todas las consultas crudas que eligen alumnos o matrículas llevan la condición; las
    // otras dos sólo cuentan recursos de un curso o el avance de alumnos ya elegidos.
    const choosing = prisma.$queryRaw.mock.calls.filter(
      ([parts]) => !/FROM lms_recursos r|FROM lms_progreso_recurso p/.test(sqlOf(parts)),
    );
    expect(choosing.length).toBeGreaterThan(0);
    for (const call of choosing) expect(JSON.stringify(call)).toContain('m.fecha_finalizacion IS NULL');
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true, completedAt: null }) }),
    );
  });

  it('la búsqueda se envía como parámetro, con los comodines de LIKE escapados', async () => {
    const { service, prisma } = serviceWith();

    await service.getSummary(ADMIN, { search: '100%_x' });

    const values = JSON.stringify(prisma.$queryRaw.mock.calls[0]);
    expect(values).toContain('%100\\\\%\\\\_x%');
  });

  it('sólo da marca para seguir cuando quedan alumnos por traer', async () => {
    const row = (guid: string) => ({
      guid,
      firstName: guid,
      lastName: '',
      email: `${guid}@x`,
      lastAccessAt: null,
      createdAt: new Date('2026-09-01T10:00:00Z'),
    });

    const withMore = serviceWith({ page: [row('c'), row('b'), row('a')] });
    const first = await withMore.service.getStudents(ADMIN, { limit: 2 });
    expect(first.students.map((a) => a.guid)).toEqual(['c', 'b']);
    expect(first.cursor).not.toBeNull();

    const noMore = serviceWith({ page: [row('b'), row('a')] });
    const last = await noMore.service.getStudents(ADMIN, { limit: 2 });
    expect(last.cursor).toBeNull();
  });

  it('cada fila resume sus cursos: avance, recursos y módulos terminados', async () => {
    const { service } = serviceWith({
      page: [
        { guid: 'ana', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x', lastAccessAt: null, createdAt: new Date() },
      ],
      pageEnrollments: [{ userGuid: 'ana', courseGuid: 'c1' }],
      modules: [
        { guid: 'm1', courseGuid: 'c1', _count: { resources: 2 } },
        { guid: 'm2', courseGuid: 'c1', _count: { resources: 2 } },
      ],
      doneByModule: [{ userGuid: 'ana', moduleGuid: 'm1', done: 2n }],
      submissions: [{ userGuid: 'ana', submissions: 3n }],
    });

    const { students } = await service.getStudents(ADMIN, {});

    expect(students[0].progress).toBe(50);
    expect(students[0].totalSubmissions).toBe(3);
    expect(students[0].courses[0]).toMatchObject({
      courseTitle: 'Curso 1',
      percent: 50,
      completed: 2,
      totalResources: 4,
      completedModules: 1,
      totalModules: 2,
    });
  });

  it('el desglose por módulo exige que el alumno esté matriculado y activo', async () => {
    const notEnrolled = serviceWith();
    await expect(notEnrolled.service.getStudentModules('c1', 'ana', ADMIN)).rejects.toBeInstanceOf(NotFoundException);

    const unenrolled = serviceWith({ enrollment: [{ active: false }] });
    await expect(unenrolled.service.getStudentModules('c1', 'ana', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    expect(unenrolled.access.managedCourse).toHaveBeenCalledWith('c1', ADMIN);
  });
});
