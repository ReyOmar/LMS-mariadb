import { BadRequestException, ConflictException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Volver a matricular a alguien que ya estuvo en el curso.
 *
 * Son dos situaciones que se parecen mucho y piden lo contrario:
 *
 *  - A quien se quedó a medias y se le dio de baja hay que **devolverle su avance**. Una
 *    baja administrativa no puede costarle el trabajo hecho, aunque tenga el certificado
 *    de una vuelta anterior.
 *  - A quien terminó su vuelta y vuelve —otra infracción, años después— hay que **ponerlo a
 *    cero**, o se encontrará el curso aprobado sin haberlo repetido. Sus notas no se
 *    pierden: las entregas se archivan sin archivo, que se borró al emitirse su certificado.
 *
 * Equivocarse en cualquiera de las dos direcciones se nota tarde y mal, así que las dos
 * quedan fijadas aquí.
 */

const COURSE = 'curso-1';
const STUDENT_ID = 'alumno-1';
const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');

interface State {
  /** La matrícula anterior, o `null` si nunca estuvo en el curso. */
  previous?: { active: boolean; completedAt: Date | null } | null;
  progress?: number;
  submissions?: number;
  maxStudents?: number | null;
  enrolled?: number;
  courseStatus?: 'DRAFT' | 'PUBLISHED';
  /** Archivos de la vuelta certificada que la puesta al día del arranque aún no retiró. */
  leftoverFiles?: string[];
}

/** Una entrega de la vuelta anterior, cuyo archivo se borró al emitirse el certificado. */
function previousSubmission(index: number): Record<string, unknown> {
  return {
    guid: `entrega-${index}`,
    assignmentGuid: `tarea-${index}`,
    attachmentKey: null,
    attachmentName: 'informe.pdf',
    filePurged: true,
    status: 'GRADED',
    attemptNumber: 1,
    submittedAt: new Date(2025, 0, index + 1),
    score: 90,
    feedback: 'Bien argumentado.',
    assignment: { title: `Informe ${index}` },
  };
}

/** Sólo los campos que pide la consulta, como hace la base. */
function selected(row: Record<string, unknown>, select: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(select).map((field) => [field, row[field]]));
}

/**
 * Servicio con un doble de Prisma que anota, en orden, lo que se le pide. La transacción
 * interactiva recibe el mismo doble: lo que importa es qué se hace dentro de ella.
 */
function baseWith({
  previous = { active: false, completedAt: null },
  progress = 0,
  submissions = 0,
  maxStudents = null,
  enrolled = 0,
  courseStatus = 'PUBLISHED',
  leftoverFiles = [],
}: State = {}) {
  const steps: string[] = [];
  const lifecycle: string[] = [];
  const deleted = { progress: 0, submissions: [] as string[] };
  const archived: Record<string, unknown>[] = [];
  const seatQueries: unknown[] = [];
  let updatedEnrollment: Record<string, unknown> | null = null;
  let createdEnrollment: Record<string, unknown> | null = null;

  const prisma = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      steps.push(parts.join('?').includes('FOR UPDATE') ? 'bloqueo' : 'consulta');
      return [{ maxStudents }];
    },
    enrollment: {
      findUnique: async () => (previous ? { id: 7, ...previous } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdEnrollment = data;
        return { id: 8, ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updatedEnrollment = data;
        return { id: 7, ...data };
      },
      count: async (query: unknown) => {
        steps.push('recuento');
        seatQueries.push(query);
        return enrolled;
      },
    },
    resourceProgress: {
      deleteMany: async () => {
        deleted.progress = progress;
        return { count: progress };
      },
    },
    submission: {
      findMany: async ({ select }: { select: Record<string, unknown> }) =>
        Array.from({ length: submissions }, (_, i) => selected(previousSubmission(i), select)),
      deleteMany: async ({ where }: { where: { guid: { in: string[] } } }) => {
        deleted.submissions.push(...where.guid.in);
        return { count: where.guid.in.length };
      },
    },
    archivedSubmission: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        archived.push(...data);
        return { count: data.length };
      },
    },
    user: {
      findFirst: async () => ({ guid: STUDENT_ID, email: 'alumno@pesv.test', firstName: 'Ana' }),
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const result = await work(prisma);
      lifecycle.push('confirmada');
      return result;
    },
  };

  const access = {
    managedCourse: async () => ({
      guid: COURSE,
      title: 'Manejo defensivo',
      status: courseStatus,
      teacherGuid: 'profe',
    }),
  };
  const realtime = { emitToUsers: () => undefined, emitToCourseStaff: () => undefined };
  const mail = { sendEnrollment: jest.fn(async () => true) };
  const notifications = { create: jest.fn(async () => ({ id: 1 })) };

  const submissionFiles = {
    retireRound: jest.fn(async () => leftoverFiles),
    deleteRetired: jest.fn(async (keys: string[]) => {
      lifecycle.push(`borrado: ${keys.join(', ')}`);
    }),
  };

  const service = new EnrollmentsService(
    prisma as never,
    access as never,
    realtime as never,
    mail as never,
    notifications as never,
    submissionFiles as never,
  );
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

  return {
    service,
    steps,
    lifecycle,
    deleted,
    archived,
    seatQueries,
    mail,
    notifications,
    enrollment: () => updatedEnrollment,
    created: () => createdEnrollment,
  };
}

const NO_FILES_TO_RETIRE = { retireRound: async () => [], deleteRetired: async () => undefined };

const FINISHED = { active: false, completedAt: new Date(2025, 5, 1) };
const HALFWAY = { active: false, completedAt: null };

describe('EnrollmentsService · volver a matricular', () => {
  it('quien se quedó a medias retoma donde lo dejó, aunque tenga el certificado de una vuelta anterior', async () => {
    // La segunda vuelta va por la mitad: su matrícula no está terminada.
    const { service, deleted, archived } = baseWith({ previous: HALFWAY, progress: 5, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(deleted).toEqual({ progress: 0, submissions: [] });
    expect(archived).toEqual([]);
  });

  it('a quien terminó su vuelta no se le abre otra sin confirmarlo: 409 y nada cambia', async () => {
    const { service, deleted, archived, enrollment } = baseWith({ previous: FINISHED, progress: 5, submissions: 2 });

    await expect(service.enroll(COURSE, STUDENT_ID, ADMIN)).rejects.toThrow(ConflictException);
    await expect(service.enroll(COURSE, STUDENT_ID, ADMIN)).rejects.toThrow(/ya terminó el curso/);

    expect(deleted).toEqual({ progress: 0, submissions: [] });
    expect(archived).toEqual([]);
    expect(enrollment()).toBeNull();
  });

  it('con la confirmación, quien terminó su vuelta empieza de cero', async () => {
    const { service, deleted } = baseWith({ previous: FINISHED, progress: 5, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN, true);

    expect(deleted).toEqual({ progress: 5, submissions: ['entrega-0', 'entrega-1'] });
  });

  it('al empezar de cero sus entregas se archivan sin archivo y con su nota y su comentario', async () => {
    const { service, archived } = baseWith({ previous: FINISHED, submissions: 2 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN, true);

    expect(archived).toHaveLength(2);
    expect(archived[0]).toEqual({
      guid: 'entrega-0',
      userGuid: STUDENT_ID,
      courseGuid: COURSE,
      assignmentGuid: 'tarea-0',
      assignmentTitle: 'Informe 0',
      attachmentName: 'informe.pdf',
      status: 'GRADED',
      attemptNumber: 1,
      submittedAt: new Date(2025, 0, 1),
      score: 90,
      feedback: 'Bien argumentado.',
    });
  });

  it('los archivos que la vuelta certificada aún conservaba se retiran, y sólo tras confirmar', async () => {
    const { service, lifecycle } = baseWith({
      previous: FINISHED,
      submissions: 1,
      leftoverFiles: ['entregas/vieja.pdf'],
    });

    await service.enroll(COURSE, STUDENT_ID, ADMIN, true);

    expect(lifecycle).toEqual(['confirmada', 'borrado: entregas/vieja.pdf']);
  });

  it('quien empieza de cero abre su vuelta con fecha nueva', async () => {
    const { service, enrollment } = baseWith({ previous: FINISHED, progress: 3, submissions: 1 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN, true);

    expect(enrollment()).toMatchObject({ active: true, unenrolledAt: null, completedAt: null });
    expect(enrollment()?.enrolledAt).toBeInstanceOf(Date);
  });

  it('quien retoma tras una baja conserva la fecha en que empezó su vuelta', async () => {
    // Es la «fecha de inscripción» de su certificado: las notas y las horas vienen de antes de la baja.
    const { service, enrollment } = baseWith({ previous: HALFWAY, progress: 3, submissions: 1 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(enrollment()).toEqual({ active: true, unenrolledAt: null, type: 'MANUAL' });
  });

  it('quien empieza de cero también empieza con el recuento de avance a cero; quien retoma lo conserva', async () => {
    const fromScratch = baseWith({ previous: FINISHED, progress: 5, submissions: 2 });
    await fromScratch.service.enroll(COURSE, STUDENT_ID, ADMIN, true);
    expect(fromScratch.enrollment()).toMatchObject({ completedResources: 0 });

    const resumes = baseWith({ previous: HALFWAY, progress: 5, submissions: 2 });
    await resumes.service.enroll(COURSE, STUDENT_ID, ADMIN);
    expect(resumes.enrollment()).not.toHaveProperty('completedResources');
  });

  it('quien ya está dentro no se matricula dos veces', async () => {
    const { service } = baseWith({ previous: { active: true, completedAt: null } });

    await expect(service.enroll(COURSE, STUDENT_ID, ADMIN, true)).rejects.toThrow(/ya está matriculado/);
  });
});

describe('EnrollmentsService · cupo', () => {
  it('bloquea la fila del curso antes de contar a los matriculados', async () => {
    const { service, steps } = baseWith({ previous: null, maxStudents: 30, enrolled: 10 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    // Sin el bloqueo, dos altas simultáneas contarían lo mismo y las dos entrarían.
    expect(steps).toEqual(['bloqueo', 'recuento']);
  });

  it('quien ya se certificó conserva el acceso, pero no ocupa plaza', async () => {
    const { service, seatQueries } = baseWith({ previous: null, maxStudents: 30, enrolled: 10 });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(seatQueries).toEqual([{ where: { courseGuid: COURSE, active: true, completedAt: null } }]);
  });

  it('con el cupo lleno no matricula y lo dice en singular o en plural según la cifra', async () => {
    const one = baseWith({ previous: null, maxStudents: 1, enrolled: 1 });
    await expect(one.service.enroll(COURSE, STUDENT_ID, ADMIN)).rejects.toThrow(BadRequestException);
    await expect(one.service.enroll(COURSE, STUDENT_ID, ADMIN)).rejects.toThrow('cupo máximo de 1 estudiante.');
    expect(one.created()).toBeNull();

    const many = baseWith({ previous: null, maxStudents: 2, enrolled: 2 });
    await expect(many.service.enroll(COURSE, STUDENT_ID, ADMIN)).rejects.toThrow('cupo máximo de 2 estudiantes.');
  });

  it('sin cupo declarado no cuenta a nadie', async () => {
    const { service, steps, created } = baseWith({ previous: null });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(steps).toEqual(['bloqueo']);
    expect(created()).toMatchObject({ userGuid: STUDENT_ID, courseGuid: COURSE });
  });
});

describe('EnrollmentsService · aviso de matrícula', () => {
  it('en un curso publicado avisa en la campana con enlace al curso y por correo', async () => {
    const { service, mail, notifications } = baseWith({ previous: null });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userGuid: STUDENT_ID,
        type: 'COURSE_WELCOME',
        actionUrl: `/courses/${COURSE}`,
        message: expect.stringContaining('Puedes empezar'),
      }),
    );
    expect(mail.sendEnrollment).toHaveBeenCalledTimes(1);
  });

  it('en un curso en borrador no dice que ya puede empezar ni envía el correo de bienvenida', async () => {
    const { service, mail, notifications } = baseWith({ previous: null, courseStatus: 'DRAFT' });

    await service.enroll(COURSE, STUDENT_ID, ADMIN);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('todavía no está publicado') }),
    );
    expect(mail.sendEnrollment).not.toHaveBeenCalled();
  });
});

describe('EnrollmentsService · dar de baja', () => {
  it('desactiva la matrícula y cierra en la misma transacción los intentos abiertos del curso', async () => {
    const operations: { model: string; args: Record<string, any> }[] = [];
    const record = (model: string) => (args: Record<string, any>) => {
      operations.push({ model, args });
      return { model };
    };
    const prisma = {
      enrollment: { findUnique: async () => ({ id: 7, active: true }), update: record('enrollment') },
      submission: { updateMany: record('submission') },
      $transaction: jest.fn(async (batch: unknown[]) => batch),
    };
    const access = { managedCourse: async () => ({ guid: COURSE, teacherGuid: 'profe' }) };
    const realtime = { emitToUsers: () => undefined, emitToCourseStaff: () => undefined };
    const service = new EnrollmentsService(
      prisma as never,
      access as never,
      realtime as never,
      {} as never,
      {} as never,
      NO_FILES_TO_RETIRE as never,
    );

    await service.unenroll(COURSE, STUDENT_ID, ADMIN);

    expect(prisma.$transaction).toHaveBeenCalledWith([{ model: 'enrollment' }, { model: 'submission' }]);
    expect(operations[0].args.data).toMatchObject({ active: false });
    // Como un intento que se quedó sin tiempo: gastado y sin aciertos.
    expect(operations[1].args).toMatchObject({
      where: { userGuid: STUDENT_ID, status: 'DRAFT', assignment: { module: { courseGuid: COURSE } } },
      data: { status: 'GRADED', score: 0 },
    });
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
    const service = new EnrollmentsService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      NO_FILES_TO_RETIRE as never,
    );

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
    const service = new EnrollmentsService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      NO_FILES_TO_RETIRE as never,
    );

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
    const service = new EnrollmentsService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      NO_FILES_TO_RETIRE as never,
    );
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

    expect(queries[0].where).not.toHaveProperty('AND');
    expect(JSON.stringify(queries[1].where.AND)).toContain('"contains":"an"');
  });
});

describe('EnrollmentsService · candidatos ya certificados', () => {
  it('marca a quien terminó su vuelta en este curso, para avisar antes de abrirle una nueva', async () => {
    const queries: { select: Record<string, unknown> }[] = [];
    const prisma = {
      user: {
        findMany: async (query: { select: Record<string, unknown> }) => {
          queries.push(query);
          return [
            { guid: 'a', firstName: 'Ana', lastName: 'Ruiz', email: 'a@pesv.test', enrollments: [{ id: 3 }] },
            { guid: 'b', firstName: 'Beto', lastName: 'Gil', email: 'b@pesv.test', enrollments: [] },
          ];
        },
      },
    };
    const access = { managedCourse: async () => ({ guid: COURSE }) };
    const service = new EnrollmentsService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      NO_FILES_TO_RETIRE as never,
    );

    const candidates = await service.getCandidates(COURSE, ADMIN);

    // Cuenta que la vuelta actual en este curso esté terminada, no un certificado cualquiera:
    // quien tiene el de una vuelta anterior y va por la mitad de la siguiente la retoma.
    expect(queries[0].select.enrollments).toMatchObject({
      where: { courseGuid: COURSE, completedAt: { not: null } },
    });
    expect(queries[0].select).not.toHaveProperty('certificates');
    expect(candidates).toEqual([
      { guid: 'a', firstName: 'Ana', lastName: 'Ruiz', email: 'a@pesv.test', certified: true },
      { guid: 'b', firstName: 'Beto', lastName: 'Gil', email: 'b@pesv.test', certified: false },
    ]);
  });
});
