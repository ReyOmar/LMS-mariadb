import { StudentsService } from './students.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Tiempo de estudio.
 *
 * El visor del curso manda un latido cada cierto tiempo y el servidor acumula minutos con
 * ellos. Esas horas acaban en el panel del alumno y en el seguimiento del examinador, así
 * que lo que importa es que **no se puedan inflar**: ni con dos pestañas abiertas ni
 * recargando la página.
 */

const COURSE = 'curso-1';
const STUDENT = sessionFor('STUDENT', 'COLOMBIA', 'alumna');

interface StoredSession {
  id: number;
  durationSeconds: number;
  endedAt: Date | null;
}

/** Tabla de sesiones en memoria, con el filtro por antigüedad que usa el servicio. */
function sessionsWith(initial?: StoredSession) {
  const rows: StoredSession[] = initial ? [initial] : [];
  let nextId = rows.length + 1;

  const prisma = {
    studySession: {
      findFirst: async ({ where }: { where: { endedAt: { gte: Date } } }) =>
        rows.find((row) => row.endedAt !== null && row.endedAt >= where.endedAt.gte) ?? null,

      create: async ({ data }: { data: { durationSeconds: number; endedAt: Date } }) => {
        const row = { id: nextId++, durationSeconds: data.durationSeconds, endedAt: data.endedAt };
        rows.push(row);
        return row;
      },

      update: async ({ where, data }: { where: { id: number }; data: StoredSession }) => {
        const row = rows.find((f) => f.id === where.id);
        if (!row) throw new Error(`No existe la sesión ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
  };

  return { rows, prisma };
}

function createService(prisma: unknown, timeZone = 'America/Bogota') {
  // La matrícula se comprueba antes y tiene sus propias pruebas; aquí se da por buena.
  const access = { ensureEnrollment: async () => undefined };
  const settings = { getSettings: async () => ({ timeZone }) };
  return new StudentsService(prisma as never, access as never, settings as never, { emit: () => true } as never);
}

/** Coloca el reloj en un instante concreto para poder medir huecos exactos. */
function atMinute(minutes: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 10, minutes, 0));
}

describe('StudentsService · tiempo de estudio', () => {
  afterEach(() => jest.useRealTimers());

  function withClockAt(instant: Date) {
    jest.useFakeTimers().setSystemTime(instant);
  }

  it('el primer latido abre una sesión sin tiempo acumulado', async () => {
    const { rows, prisma } = sessionsWith();
    withClockAt(atMinute(0));

    await createService(prisma).recordHeartbeat(COURSE, STUDENT);

    expect(rows).toHaveLength(1);
    expect(rows[0].durationSeconds).toBe(0);
  });

  it('suma los segundos realmente transcurridos entre dos latidos', async () => {
    const { rows, prisma } = sessionsWith({ id: 1, durationSeconds: 0, endedAt: atMinute(0) });
    withClockAt(atMinute(1));

    await createService(prisma).recordHeartbeat(COURSE, STUDENT);

    expect(rows[0].durationSeconds).toBe(60);
  });

  it('dos pestañas abiertas no cuentan el tiempo dos veces', async () => {
    const { rows, prisma } = sessionsWith({ id: 1, durationSeconds: 600, endedAt: atMinute(10) });
    const service = createService(prisma);

    // El mismo minuto, dos latidos casi seguidos: uno por pestaña.
    withClockAt(new Date(atMinute(11).getTime()));
    await service.recordHeartbeat(COURSE, STUDENT);
    withClockAt(new Date(atMinute(11).getTime() + 2_000));
    await service.recordHeartbeat(COURSE, STUDENT);

    // 60 s del primero y 2 s del segundo, no 120.
    expect(rows[0].durationSeconds).toBe(662);
  });

  it('recargar la página no regala tiempo', async () => {
    const { rows, prisma } = sessionsWith({ id: 1, durationSeconds: 300, endedAt: atMinute(5) });
    const service = createService(prisma);

    // Diez latidos inmediatos, como diez recargas seguidas.
    for (let i = 0; i < 10; i++) {
      withClockAt(new Date(atMinute(5).getTime() + i * 100));
      await service.recordHeartbeat(COURSE, STUDENT);
    }

    expect(rows[0].durationSeconds).toBeLessThan(302);
  });

  it('tras un hueco largo empieza una sesión nueva en lugar de alargar la anterior', async () => {
    const { rows, prisma } = sessionsWith({ id: 1, durationSeconds: 600, endedAt: atMinute(0) });
    withClockAt(atMinute(30));

    await createService(prisma).recordHeartbeat(COURSE, STUDENT);

    expect(rows).toHaveLength(2);
    expect(rows[0].durationSeconds).toBe(600);
    expect(rows[1].durationSeconds).toBe(0);
  });

  it('un reloj que va hacia atrás no resta tiempo', async () => {
    const { rows, prisma } = sessionsWith({ id: 1, durationSeconds: 120, endedAt: atMinute(2) });
    withClockAt(new Date(atMinute(2).getTime() - 30_000));

    await createService(prisma).recordHeartbeat(COURSE, STUDENT);

    expect(rows[0].durationSeconds).toBe(120);
  });
});

/**
 * Calendario de actividad del alumno.
 *
 * La base guarda en UTC y el servidor puede estar en cualquier zona; los días que ve el
 * alumno tienen que ser los de su sede.
 */
describe('StudentsService · días con actividad', () => {
  function activityAt(instants: Date[]) {
    const ranges: { gte: Date; lt: Date }[] = [];
    const prisma = {
      resourceProgress: {
        findMany: async ({ where }: { where: { completedAt: { gte: Date; lt: Date } } }) => {
          ranges.push(where.completedAt);
          return instants
            .filter((instant) => instant >= where.completedAt.gte && instant < where.completedAt.lt)
            .map((completedAt) => ({ completedAt }));
        },
      },
      submission: { findMany: async () => [] },
    };
    return { prisma, ranges };
  }

  it('cuenta el día de la sede, no el de UTC', async () => {
    // 3 de marzo a las 22:30 en Bogotá son las 03:30 del día 4 en UTC.
    const { prisma } = activityAt([new Date('2026-03-04T03:30:00Z')]);

    const { days } = await createService(prisma).getActiveDays(STUDENT, 2026, 2);

    expect(days).toEqual([3]);
  });

  it('el mes empieza y acaba a medianoche de la sede', async () => {
    const { prisma, ranges } = activityAt([]);

    await createService(prisma, 'America/Mexico_City').getActiveDays(STUDENT, 2026, 11);

    expect(ranges[0].gte.toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(ranges[0].lt.toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
});

/**
 * Cursos completados del panel del alumno.
 *
 * Un curso está completado cuando su vuelta actual se certificó. Tener todos los recursos
 * no basta: si alguna tarea espera calificación, sigue siendo formación en curso.
 */
describe('StudentsService · cursos completados', () => {
  function metricsService(enrollments: { courseGuid: string; completedAt: Date | null }[]) {
    const prisma = {
      enrollment: { findMany: async () => enrollments },
      resource: { findMany: async () => [{ guid: 'r1' }, { guid: 'r2' }, { guid: 'r3' }] },
      resourceProgress: {
        findMany: async () => [{ resourceGuid: 'r1' }, { resourceGuid: 'r2' }, { resourceGuid: 'r3' }],
      },
      studySession: { aggregate: async () => ({ _sum: { durationSeconds: 0 } }) },
      submission: { findMany: async () => [] },
    };
    return createService(prisma);
  }

  it('cuenta como completados los cursos con la vuelta actual certificada', async () => {
    const service = metricsService([
      { courseGuid: 'c1', completedAt: new Date('2026-02-01T00:00:00Z') },
      { courseGuid: 'c2', completedAt: null },
    ]);

    const metrics = await service.getMetrics(STUDENT);

    expect(metrics.totalCourses).toBe(2);
    expect(metrics.completedCourses).toBe(1);
  });

  it('todos los recursos hechos con una tarea sin calificar no cuentan como curso completado', async () => {
    const service = metricsService([{ courseGuid: 'c1', completedAt: null }]);

    const metrics = await service.getMetrics(STUDENT);

    expect(metrics.completedResources).toBe(3);
    expect(metrics.completedCourses).toBe(0);
  });
});
