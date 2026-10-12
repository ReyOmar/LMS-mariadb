import 'reflect-metadata';
import { MaintenanceService } from './maintenance.service';
import { StorageService } from '../storage/storage.service';

/**
 * Ninguna tarea programada borra archivos.
 *
 * Una portada o un certificado sólo desaparecen cuando alguien los elimina o los sustituye, y
 * una entrega, además, al emitirse el certificado de su vuelta. Una tarea nocturna no puede
 * decidir que un archivo sobra: basta una referencia que no sepa leer —una imagen dentro de
 * un texto, un enlace, una base restaurada— para llevarse algo que se está usando.
 */
describe('MaintenanceService — ninguna tarea borra archivos ni información de usuarios', () => {
  /** Tablas cuyas filas guardan claves o enlaces de archivos, y el registro de subidas. */
  const FILE_MODELS = ['resource', 'submission', 'certificate', 'user', 'course', 'countrySettings', 'storedFile'];

  const WRITES = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

  /** Métodos con `@Cron`, `@Interval` o `@Timeout`: `@nestjs/schedule` los marca con esta clave. */
  function scheduledTasks(): string[] {
    const prototype = MaintenanceService.prototype as unknown as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).filter((name) => {
      const member = prototype[name];
      return typeof member === 'function' && Reflect.hasMetadata('SCHEDULER_TYPE', member);
    });
  }

  /** Base que devuelve las filas indicadas por tabla y anota cada escritura como `tabla.operación`. */
  function recordingBase(rows: Record<string, unknown[]>) {
    const writes: string[] = [];
    const base: object = new Proxy(
      {},
      {
        get: (_, model: string) => {
          // Las escrituras crudas sólo recalculan el recuento de avance de `lms_matriculas`.
          if (model === '$executeRaw') {
            return async () => {
              writes.push('enrollment.$executeRaw');
              return 1;
            };
          }
          // La lectura cruda es el bloqueo de la matrícula, y la transacción trabaja sobre la misma base.
          if (model === '$queryRaw') return async () => [{ active: 1, completedAt: null }];
          if (model === '$transaction') return async (work: (tx: object) => Promise<unknown>) => work(base);
          return {
            findMany: async () => rows[model] ?? [],
            count: async () => 1,
            ...Object.fromEntries(
              WRITES.map((operation) => [
                operation,
                async () => {
                  writes.push(`${model}.${operation}`);
                  return { count: 1 };
                },
              ]),
            ),
          };
        },
      },
    );
    return { base, writes };
  }

  it('no recibe el almacenamiento', () => {
    const dependencies = Reflect.getMetadata('design:paramtypes', MaintenanceService) as unknown[];

    expect(dependencies).not.toContain(StorageService);
  });

  it('las tareas programadas son las conocidas', () => {
    // Una tarea nueva hace fallar esta prueba a propósito: antes de añadirla a la lista hay
    // que comprobar que tampoco toca archivos ni las filas que los referencian.
    expect(scheduledTasks().sort()).toEqual([
      'cleanHiddenMessages',
      'cleanTemporaryData',
      'reconcileCompletedResources',
      'sendInactivityReminders',
      'unlockLongWaits',
    ]);
  });

  it('ninguna tarea modifica las filas que guardan archivos', async () => {
    const hiddenUntil = new Date('2026-03-01T10:00:00Z');
    const { base, writes } = recordingBase({
      user: [{ guid: 'ana', email: 'ana@ejemplo.com', firstName: 'Ana', country: 'COLOMBIA', lastAccessAt: null }],
      submission: [
        {
          guid: 'entrega-1',
          userGuid: 'ana',
          assignmentGuid: 'tarea-1',
          user: { country: 'COLOMBIA' },
          assignment: { title: 'Informe', module: { courseGuid: 'curso-1' } },
        },
      ],
      enrollment: [{ userGuid: 'ana', courseGuid: 'curso-1' }],
      hiddenConversation: [
        { userGuid: 'ana', contactGuid: 'beto', hiddenUntil },
        { userGuid: 'beto', contactGuid: 'ana', hiddenUntil },
      ],
    });
    const notifications = { create: async () => undefined };
    const mail = { sendInactivityReminder: async () => undefined };

    const service = new MaintenanceService(base as never, notifications as never, mail as never);
    const failures = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    const tasks = service as unknown as Record<string, () => Promise<void>>;
    for (const task of scheduledTasks()) await tasks[task]();

    // Las tareas han trabajado de verdad sobre los datos…
    expect(failures).not.toHaveBeenCalled();
    expect(writes).toEqual(
      expect.arrayContaining([
        'resourceProgress.upsert',
        'emailVerification.deleteMany',
        'passwordReset.deleteMany',
        'message.deleteMany',
        'enrollment.$executeRaw',
      ]),
    );
    // …y ninguna escritura ha ido a una tabla que referencie archivos.
    expect(writes.filter((write) => FILE_MODELS.includes(write.split('.')[0]))).toEqual([]);
    // Lo único que borran son códigos y enlaces caducados y mensajes que las dos partes vaciaron.
    expect(writes.filter((write) => /\.delete(Many)?$/.test(write)).sort()).toEqual([
      'emailVerification.deleteMany',
      'message.deleteMany',
      'passwordReset.deleteMany',
    ]);
  });
});

/** Filas de `rows` que siguen a la marca `where.guid.gt`, en orden de `guid` y con el tope de `take`. */
function keysetPage<T extends { guid: string }>(
  rows: T[],
  query: { where?: { guid?: { gt: string } }; take?: number },
) {
  const after = query.where?.guid?.gt;
  return [...rows]
    .sort((a, b) => a.guid.localeCompare(b.guid))
    .filter((row) => !after || row.guid > after)
    .slice(0, query.take ?? rows.length);
}

/**
 * Desbloqueo de quien lleva demasiado esperando una calificación.
 *
 * La tarea corre cada hora sobre las mismas entregas mientras sigan sin calificar, así que
 * lo que hay que sostener es que **no repita** —quien ya fue desbloqueado no puede recibir
 * el aviso una y otra vez— y que **no deje a nadie atrás** por muchas entregas que haya
 * delante. Tampoco desbloquea a quien se dio de baja del curso, aunque sea mientras corre
 * la tanda.
 */
describe('MaintenanceService — desbloqueo por espera', () => {
  /** Una entrega sin calificar de hace más tiempo del que se tolera. */
  function submission(user: string, assignment: string, course = 'curso-1') {
    return {
      guid: `entrega-${user}-${assignment}`,
      userGuid: user,
      assignmentGuid: assignment,
      user: { country: 'COLOMBIA' },
      assignment: { title: 'Informe', module: { courseGuid: course } },
    };
  }

  /** Cuándo se enviaron las entregas que esperan: bastante antes del corte de 48 h. */
  const LONG_AGO = new Date('2020-01-01T00:00:00Z');

  /** Lo que la tarea pide al releer una entrega. */
  type SubmissionFilter = { guid: string; status?: { in: string[] }; submittedAt?: { lt: Date } };

  /**
   * Base con las entregas `pending` esperando calificación.
   *
   * `unenrolled` ya se había dado de baja al preparar la tanda. Lo demás ocurre entre que
   * se prepara la tanda y se bloquea la matrícula: `unenrolledMeanwhile` se da de baja,
   * `gradedMeanwhile` recibe su nota y `resubmittedMeanwhile` se reenvía, lo que reinicia
   * la espera.
   */
  function baseWithWaits(
    pending: ReturnType<typeof submission>[],
    alreadyDone: { u: string; r: string }[],
    {
      unenrolled = [] as string[],
      unenrolledMeanwhile = [] as string[],
      gradedMeanwhile = [] as string[],
      resubmittedMeanwhile = [] as string[],
    } = {},
  ) {
    const created: { userGuid: string; resourceGuid: string }[] = [];
    let progressQueries = 0;
    let transactions = 0;

    /** La entrega tal como está al releerla con la matrícula ya bloqueada. */
    const current = (guid: string) => {
      if (gradedMeanwhile.includes(guid)) return { status: 'GRADED', submittedAt: LONG_AGO };
      // Sigue sin nota, pero la fecha de envío es la del reenvío.
      if (resubmittedMeanwhile.includes(guid)) return { status: 'IN_REVIEW', submittedAt: new Date() };
      return { status: 'SUBMITTED', submittedAt: LONG_AGO };
    };

    const base = {
      $executeRaw: async () => 1,
      // El bloqueo de la matrícula: inactiva para quien se dio de baja, antes o durante la tanda.
      $queryRaw: async (_sql: TemplateStringsArray, userGuid: string) => [
        { active: unenrolled.includes(userGuid) || unenrolledMeanwhile.includes(userGuid) ? 0 : 1, completedAt: null },
      ],
      // Cada transacción es una entrega que pasó el filtro de la tanda y se relee con la matrícula bloqueada.
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        transactions++;
        return work(base);
      },
      submission: {
        findMany: async (query: { where?: { guid?: { gt: string } }; take?: number }) => keysetPage(pending, query),
        // Aplica a la entrega actual los filtros que pida la consulta, como haría la base.
        count: async ({ where }: { where: SubmissionFilter }) => {
          const row = current(where.guid);
          const matches =
            (!where.status || where.status.in.includes(row.status)) &&
            (!where.submittedAt || row.submittedAt < where.submittedAt.lt);
          return matches ? 1 : 0;
        },
      },
      enrollment: {
        findMany: async () =>
          pending
            .filter((row) => !unenrolled.includes(row.userGuid))
            .map((row) => ({ userGuid: row.userGuid, courseGuid: row.assignment.module.courseGuid })),
      },
      resourceProgress: {
        findMany: async () => {
          progressQueries++;
          return alreadyDone.map((a) => ({ userGuid: a.u, resourceGuid: a.r }));
        },
        upsert: async ({ create }: { create: { userGuid: string; resourceGuid: string } }) => {
          created.push(create);
          return create;
        },
      },
    };

    return { base, created, queries: () => progressQueries, transactions: () => transactions };
  }

  function serviceWith(base: unknown, notified: string[]) {
    const notifications = {
      create: async ({ userGuid }: { userGuid: string }) => {
        notified.push(userGuid);
      },
    };
    const service = new MaintenanceService(base as never, notifications as never, {} as never);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    return service;
  }

  it('desbloquea y avisa a quien todavía no tenía avance', async () => {
    const notified: string[] = [];
    const { base, created } = baseWithWaits([submission('ana', 'tarea-1')], []);

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toEqual([{ userGuid: 'ana', resourceGuid: 'tarea-1', completed: true }]);
    expect(notified).toEqual(['ana']);
  });

  it('no vuelve a avisar a quien ya fue desbloqueado en una pasada anterior', async () => {
    const notified: string[] = [];
    const { base, created } = baseWithWaits([submission('ana', 'tarea-1')], [{ u: 'ana', r: 'tarea-1' }]);

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('distingue el avance de otra tarea del mismo alumno', async () => {
    const notified: string[] = [];
    // Ana ya avanzó en la tarea 2, pero la que espera calificación es la 1.
    const { base, created } = baseWithWaits([submission('ana', 'tarea-1')], [{ u: 'ana', r: 'tarea-2' }]);

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toEqual([{ userGuid: 'ana', resourceGuid: 'tarea-1', completed: true }]);
    expect(notified).toEqual(['ana']);
  });

  it('resuelve muchas entregas con una sola consulta de avances', async () => {
    const notified: string[] = [];
    const pending = Array.from({ length: 50 }, (_, i) => submission(`alumno-${i}`, `tarea-${i}`));
    const { base, queries } = baseWithWaits(pending, []);

    await serviceWith(base, notified).unlockLongWaits();

    expect(queries()).toBe(1);
    expect(notified).toHaveLength(50);
  });

  it('no deja atrás a nadie aunque delante haya cientos de entregas ya desbloqueadas', async () => {
    const notified: string[] = [];
    // 600 esperan, y las 500 primeras por orden ya se desbloquearon en pasadas anteriores.
    const pending = Array.from({ length: 600 }, (_, i) =>
      submission(`alumno-${String(i).padStart(3, '0')}`, 'tarea-1'),
    );
    const done = pending.slice(0, 500).map((row) => ({ u: row.userGuid, r: 'tarea-1' }));
    const { base, created } = baseWithWaits(pending, done);

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toHaveLength(100);
    expect(notified).toContain('alumno-599');
  });

  it('no desbloquea a quien se dio de baja del curso', async () => {
    const notified: string[] = [];
    const pending = [submission('ana', 'tarea-1'), submission('beto', 'tarea-1')];
    const { base, created, transactions } = baseWithWaits(pending, [], { unenrolled: ['beto'] });

    await serviceWith(base, notified).unlockLongWaits();

    expect(created.map((row) => row.userGuid)).toEqual(['ana']);
    expect(notified).toEqual(['ana']);
    // La baja ya se ve al preparar la tanda: ni siquiera se bloquea su matrícula.
    expect(transactions()).toBe(1);
  });

  it('no desbloquea a quien se dio de baja mientras se preparaba la tanda', async () => {
    const notified: string[] = [];
    // Los dos estaban matriculados al leer la tanda; al bloquear la matrícula, Beto ya no.
    const { base, created } = baseWithWaits([submission('ana', 'tarea-1'), submission('beto', 'tarea-1')], [], {
      unenrolledMeanwhile: ['beto'],
    });

    await serviceWith(base, notified).unlockLongWaits();

    expect(created.map((row) => row.userGuid)).toEqual(['ana']);
    expect(notified).toEqual(['ana']);
  });

  it('no devuelve el avance de una entrega que se calificó mientras se preparaba la tanda', async () => {
    const notified: string[] = [];
    const ana = submission('ana', 'tarea-1');
    const { base, created } = baseWithWaits([ana], [], { gradedMeanwhile: [ana.guid] });

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('no desbloquea una entrega que se reenvió mientras se preparaba la tanda', async () => {
    const notified: string[] = [];
    // Sigue sin calificar, pero el reenvío es de ahora: la espera vuelve a empezar.
    const ana = submission('ana', 'tarea-1');
    const { base, created } = baseWithWaits([ana], [], { resubmittedMeanwhile: [ana.guid] });

    await serviceWith(base, notified).unlockLongWaits();

    expect(created).toEqual([]);
    expect(notified).toEqual([]);
  });
});

/**
 * Recordatorio de inactividad.
 *
 * Sólo lo recibe quien tiene formación **sin terminar**: una matrícula certificada sigue
 * activa —el alumno conserva el curso y el chat— y, sin esta distinción, el aviso «Tienes
 * formación pendiente» le llegaría cada pocos días para siempre.
 */
describe('MaintenanceService — recordatorio de inactividad', () => {
  const student = (guid: string) => ({
    guid,
    email: `${guid}@ejemplo.com`,
    firstName: guid,
    country: 'COLOMBIA',
    lastAccessAt: null,
  });

  function reminderService(students: ReturnType<typeof student>[], { mailFailsFor = '' } = {}) {
    const queries: { where: Record<string, unknown> }[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const mailed: string[] = [];

    const base = {
      user: {
        findMany: async (query: { where: Record<string, unknown> & { guid?: { gt: string } }; take?: number }) => {
          queries.push(query);
          return keysetPage(students, query);
        },
      },
    };
    const notifications = { create: async () => undefined };
    const mail = {
      sendInactivityReminder: async (email: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight--;
        if (email.startsWith(mailFailsFor) && mailFailsFor) throw new Error('el correo no responde');
        mailed.push(email);
      },
    };

    const service = new MaintenanceService(base as never, notifications as never, mail as never);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    const warnings = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    return { service, queries, mailed, warnings, maxInFlight: () => maxInFlight };
  }

  it('sólo busca alumnos con alguna matrícula activa sin terminar', async () => {
    const { service, queries } = reminderService([student('ana')]);

    await service.sendInactivityReminders();

    expect(queries[0].where.enrollments).toEqual({ some: { active: true, completedAt: null } });
  });

  it('no repite el aviso a quien ya lo recibió en el periodo', async () => {
    const { service, queries } = reminderService([student('ana')]);

    await service.sendInactivityReminders();

    expect(queries[0].where.notifications).toMatchObject({ none: { type: 'INACTIVITY_REMINDER' } });
  });

  it('envía varios a la vez, pero nunca más de cinco', async () => {
    const students = Array.from({ length: 23 }, (_, i) => student(`alumno-${String(i).padStart(2, '0')}`));
    const { service, mailed, maxInFlight } = reminderService(students);

    await service.sendInactivityReminders();

    expect(mailed).toHaveLength(23);
    expect(maxInFlight()).toBe(5);
  });

  it('un correo que falla no detiene a los demás', async () => {
    const students = ['ana', 'beto', 'carla'].map(student);
    const { service, mailed, warnings } = reminderService(students, { mailFailsFor: 'beto' });

    await service.sendInactivityReminders();

    expect(mailed).toEqual(['ana@ejemplo.com', 'carla@ejemplo.com']);
    expect(warnings).toHaveBeenCalled();
  });
});

/** Todas las tareas se programan en la hora de Colombia, sea cual sea la del servidor. */
describe('MaintenanceService — zona horaria de las tareas', () => {
  it('cada tarea programada lleva su zona horaria explícita', () => {
    const prototype = MaintenanceService.prototype as unknown as Record<string, object>;
    const tasks = Object.getOwnPropertyNames(prototype).filter(
      (name) => typeof prototype[name] === 'function' && Reflect.hasMetadata('SCHEDULER_TYPE', prototype[name]),
    );

    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', prototype[task])).toMatchObject({
        timeZone: 'America/Bogota',
      });
    }
  });
});
