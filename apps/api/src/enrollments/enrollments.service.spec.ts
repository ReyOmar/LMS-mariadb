import { EnrollmentsService } from './enrollments.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Volver a matricular a alguien que ya estuvo en el curso.
 *
 * Son dos situaciones que se parecen mucho y piden lo contrario:
 *
 *  - A quien se quedó a medias y se le dio de baja hay que **devolverle su avance**. Una
 *    baja administrativa no puede costarle el trabajo hecho.
 *  - A quien ya se certificó y vuelve —otra infracción, años después— hay que **ponerlo a
 *    cero**, o se encontrará el curso aprobado sin haberlo repetido.
 *
 * Equivocarse en cualquiera de las dos direcciones se nota tarde y mal, así que las dos
 * quedan fijadas aquí.
 */

const COURSE = 'curso-1';
const STUDENT_ID = 'alumno-1';
const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');

interface State {
  /** Certificados que ya tiene el alumno de este curso. */
  certificates: number;
  progress: number;
  submissions: number;
}

function baseWith(status: State) {
  const deleted = { progress: 0, submissions: 0 };
  let updatedEnrollment: Record<string, unknown> | null = null;

  const prisma = {
    certificate: {
      findFirst: async () => (status.certificates > 0 ? { id: 1 } : null),
    },
    resource: {
      findMany: async () => [{ guid: 'r1' }, { guid: 'r2' }],
    },
    enrollment: {
      findUnique: async () => ({ id: 7, active: false }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updatedEnrollment = data;
        return { id: 7, ...data };
      },
      count: async () => 0,
    },
    resourceProgress: {
      deleteMany: async () => {
        deleted.progress = status.progress;
        return { count: status.progress };
      },
    },
    submission: {
      findMany: async () => [{ attachmentKey: 'entregas/informe.pdf' }],
      deleteMany: async () => {
        deleted.submissions = status.submissions;
        return { count: status.submissions };
      },
    },
    course: {
      findUnique: async () => ({ maxStudents: null }),
    },
    user: {
      findFirst: async () => ({ guid: STUDENT_ID, email: 'alumno@pesv.test', firstName: 'Ana' }),
    },
    // Las operaciones de la transacción ya se resolvieron al construirlas.
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };

  const access = { managedCourse: async () => ({ guid: COURSE, title: 'Manejo defensivo' }) };
  const realtime = { emitToUsers: () => undefined, emitToCourseStaff: () => undefined };
  const mail = { sendEnrollment: async () => true };
  const deletedFiles: (string | null)[] = [];
  const storage = {
    deleteFiles: async (keys: (string | null)[]) => {
      deletedFiles.push(...keys);
    },
  };

  const service = new EnrollmentsService(
    prisma as never,
    access as never,
    realtime as never,
    mail as never,
    storage as never,
  );
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  return { service, deleted, deletedFiles, enrollment: () => updatedEnrollment };
}

describe('EnrollmentsService · volver a matricular', () => {
  it('quien se quedó a medias retoma donde lo dejó', async () => {
    const { service, deleted, deletedFiles } = baseWith({ certificates: 0, progress: 5, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(deleted).toEqual({ progress: 0, submissions: 0 });
    expect(deletedFiles).toEqual([]);
  });

  it('quien ya se certificó empieza de cero', async () => {
    const { service, deleted } = baseWith({ certificates: 1, progress: 5, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(deleted).toEqual({ progress: 5, submissions: 2 });
  });

  it('al empezar de cero también retira los archivos de las entregas borradas', async () => {
    const { service, deletedFiles } = baseWith({ certificates: 1, progress: 5, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(deletedFiles).toEqual(['entregas/informe.pdf']);
  });

  it('la matrícula queda activa y con fecha nueva en los dos casos', async () => {
    for (const certificates of [0, 1]) {
      const { service, enrollment } = baseWith({ certificates, progress: 3, submissions: 1 });

      await service.enroll(COURSE, STUDENT_ID, ADMIN);

      expect(enrollment()).toMatchObject({ active: true, unenrolledAt: null });
      expect(enrollment()?.enrolledAt).toBeInstanceOf(Date);
    }
  });

  it('la vuelta nueva deja de estar terminada en los dos casos', async () => {
    for (const certificates of [0, 1]) {
      const { service, enrollment } = baseWith({ certificates, progress: 3, submissions: 1 });

      await service.enroll(COURSE, STUDENT_ID, ADMIN);

      expect(enrollment()).toMatchObject({ completedAt: null });
    }
  });

  it('quien empieza de cero también empieza con el recuento de avance a cero; quien retoma lo conserva', async () => {
    const fromScratch = baseWith({ certificates: 1, progress: 5, submissions: 2 });
    await fromScratch.service.enroll(COURSE, STUDENT_ID, ADMIN);
    expect(fromScratch.enrollment()).toMatchObject({ completedResources: 0 });

    const resumes = baseWith({ certificates: 0, progress: 5, submissions: 2 });
    await resumes.service.enroll(COURSE, STUDENT_ID, ADMIN);
    expect(resumes.enrollment()).not.toHaveProperty('completedResources');
  });

  it('nunca toca el certificado anterior', async () => {
    const { service } = baseWith({ certificates: 1, progress: 5, submissions: 2 });
    // El doble no expone forma de borrar certificados: si el servicio lo intentara,
    // fallaría aquí en lugar de pasar desapercibido.
    await expect(service.enroll(COURSE, STUDENT_ID, ADMIN)).resolves.toBeDefined();
  });
});

/**
 * La lista de matriculados de un curso.
 *
 * Una formación obligatoria puede tener mil personas dentro, y esa lista se pide cada vez
 * que alguien abre la pantalla de asignación: va por páginas.
 */
describe('EnrollmentsService · matriculados por página', () => {
  function serviceWith(totalCount: number) {
    const queries: { where?: unknown; take?: number; orderBy?: unknown }[] = [];
    const countQueries: { where?: unknown }[] = [];

    const prisma = {
      enrollment: {
        findMany: async (query: { where?: unknown; take?: number }) => {
          queries.push(query);
          return Array.from({ length: Math.min(totalCount, query.take ?? 0) }, (_, i) => ({
            id: 1000 - i,
            active: true,
            enrolledAt: new Date(2026, 0, 1, 0, i),
            user: { guid: `alumno-${i}`, firstName: 'Ana', lastName: 'Ruiz', email: 'a@b.c', lastAccessAt: null },
          }));
        },
        count: async (query: { where?: unknown }) => {
          countQueries.push(query);
          return totalCount;
        },
      },
    };
    const access = { managedCourse: async () => ({ guid: COURSE }) };
    const service = new EnrollmentsService(prisma as never, access as never, {} as never, {} as never, {} as never);

    return { service, queries, countQueries, counts: () => countQueries.length };
  }

  it('trae una página, no el curso entero', async () => {
    const { service } = serviceWith(1000);

    const { enrolledStudents, total } = await service.getEnrolledStudents(COURSE, ADMIN);

    expect(enrolledStudents).toHaveLength(50);
    expect(total).toBe(1000);
  });

  it('sigue por donde iba con la marca de la última fila', async () => {
    const { service } = serviceWith(1000);
    const first = await service.getEnrolledStudents(COURSE, ADMIN);

    const { service: other, queries } = serviceWith(1000);
    await other.getEnrolledStudents(COURSE, ADMIN, first.cursor!);

    expect(JSON.stringify(queries[0].where)).toContain('"lt"');
  });

  it('cuenta el curso sólo en la primera página', async () => {
    const { service } = serviceWith(1000);
    const first = await service.getEnrolledStudents(COURSE, ADMIN);

    const { service: other, counts } = serviceWith(1000);
    const second = await other.getEnrolledStudents(COURSE, ADMIN, first.cursor!);

    expect(counts()).toBe(0);
    expect(second).not.toHaveProperty('total');
  });

  it('no entrega marca cuando ya no queda nadie más', async () => {
    const { service } = serviceWith(10);

    const { cursor, enrolledStudents } = await service.getEnrolledStudents(COURSE, ADMIN);

    expect(enrolledStudents).toHaveLength(10);
    expect(cursor).toBeNull();
  });

  it('comprueba que el curso es suyo antes de enseñar a nadie', async () => {
    const queries: unknown[] = [];
    const prisma = {
      enrollment: {
        findMany: async (query: unknown) => {
          queries.push(query);
          return [];
        },
        count: async () => 0,
      },
    };
    const access = {
      managedCourse: async () => {
        throw new Error('curso de otra sede');
      },
    };
    const service = new EnrollmentsService(prisma as never, access as never, {} as never, {} as never, {} as never);

    await expect(service.getEnrolledStudents('curso-ajeno', ADMIN)).rejects.toThrow(/otra sede/);
    expect(queries).toHaveLength(0);
  });

  it('quien se dio de baja ya no aparece entre los matriculados ni cuenta en el total', async () => {
    const { service, queries, countQueries } = serviceWith(10);

    await service.getEnrolledStudents(COURSE, ADMIN);

    expect(queries[0].where).toMatchObject({ courseGuid: COURSE, active: true });
    expect(countQueries[0].where).toEqual({ courseGuid: COURSE, active: true });
  });
});

describe('EnrollmentsService · candidatos', () => {
  function candidatesService() {
    const queries: { where: Record<string, unknown> }[] = [];
    const prisma = {
      user: {
        findMany: async (query: { where: Record<string, unknown> }) => {
          queries.push(query);
          return [];
        },
      },
    };
    const access = { managedCourse: async () => ({ guid: COURSE }) };
    const service = new EnrollmentsService(prisma as never, access as never, {} as never, {} as never, {} as never);
    return { service, queries };
  }

  it('ofrece de nuevo a quien se dio de baja, para poder volver a matricularlo', async () => {
    const { service, queries } = candidatesService();

    await service.getCandidates(COURSE, ADMIN);

    // Sólo se excluye a quien tiene una matrícula **activa** en el curso.
    expect(queries[0].where.enrollments).toEqual({ none: { courseGuid: COURSE, active: true } });
    expect(queries[0].where).toMatchObject({ country: 'COLOMBIA', role: 'STUDENT' });
  });

  it('con una sola letra no busca: casaría con casi toda la sede', async () => {
    const { service, queries } = candidatesService();

    await expect(service.getCandidates(COURSE, ADMIN, ' a ')).resolves.toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('sin texto lista los primeros, y desde dos caracteres filtra', async () => {
    const { service, queries } = candidatesService();

    await service.getCandidates(COURSE, ADMIN, '  ');
    await service.getCandidates(COURSE, ADMIN, 'an');

    expect(queries[0].where).not.toHaveProperty('OR');
    expect(JSON.stringify(queries[1].where.OR)).toContain('"contains":"an"');
  });
});

describe('EnrollmentsService · candidatos ya certificados', () => {
  it('marca a quien ya tiene certificado de este curso, para avisar antes de abrirle una vuelta nueva', async () => {
    const queries: { select: Record<string, unknown> }[] = [];
    const prisma = {
      user: {
        findMany: async (query: { select: Record<string, unknown> }) => {
          queries.push(query);
          return [
            { guid: 'a', firstName: 'Ana', lastName: 'Ruiz', email: 'a@pesv.test', certificates: [{ id: 3 }] },
            { guid: 'b', firstName: 'Beto', lastName: 'Gil', email: 'b@pesv.test', certificates: [] },
          ];
        },
      },
    };
    const access = { managedCourse: async () => ({ guid: COURSE }) };
    const service = new EnrollmentsService(prisma as never, access as never, {} as never, {} as never, {} as never);

    const candidates = await service.getCandidates(COURSE, ADMIN);

    // Sólo cuentan los certificados de este curso, no los de otros.
    expect(queries[0].select.certificates).toMatchObject({ where: { courseGuid: COURSE } });
    expect(candidates).toEqual([
      { guid: 'a', firstName: 'Ana', lastName: 'Ruiz', email: 'a@pesv.test', certified: true },
      { guid: 'b', firstName: 'Beto', lastName: 'Gil', email: 'b@pesv.test', certified: false },
    ]);
  });
});
