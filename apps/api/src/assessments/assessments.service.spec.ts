import { ForbiddenException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { encodeCursor, MAX_PER_PAGE } from '../common/domain/pagination';
import { sessionFor } from '../common/testing/test-campus';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';
import { MIB, UploadLimit } from '../storage/upload-limits';

/**
 * La cola de corrección del examinador.
 *
 * Lo que se defiende aquí es que **la pantalla no miente**:
 *
 *  - Que una página no se salte ni repita entregas al avanzar la marca.
 *  - Que las cifras y las gráficas se calculen sobre el curso y no sobre lo cargado.
 *  - Que las sedes no se crucen: toda consulta pasa antes por `CourseAccessService`, que
 *    responde «no encontrado» a un curso ajeno.
 *  - Que quien se dio de baja del curso no aparezca ni cuente.
 */

const COURSE = 'curso-1';
const EXAMINER = sessionFor('TEACHER', 'COLOMBIA', 'profe-1');
const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin-1');

interface Query {
  where?: Record<string, unknown>;
  take?: number;
  orderBy?: unknown;
}

/** Una entrega con la forma mínima que proyecta el panel. */
function submission(index: number, date = new Date(2026, 0, 1, 0, index)) {
  return {
    guid: `entrega-${index}`,
    status: 'SUBMITTED',
    submittedAt: date,
    attachmentName: 'informe.pdf',
    attachmentKey: null,
    filePurged: false,
    score: null,
    feedback: null,
    attemptNumber: 1,
    user: { guid: `alumno-${index}`, firstName: 'Ana', lastName: 'Díaz', email: 'ana@pesv.test' },
    assignment: {
      guid: 'tarea-1',
      title: 'Informe de ruta',
      module: {
        guid: 'modulo-1',
        title: 'Módulo 1',
        course: { guid: COURSE, title: 'Manejo defensivo', passingScore: 80, coverImage: null },
      },
    },
  };
}

function isFragment(value: unknown): value is { sql: string; values: unknown[] } {
  return typeof value === 'object' && value !== null && 'sql' in value && 'values' in value;
}

/**
 * Arma la consulta como lo haría Prisma: un fragmento `Prisma.sql` interpolado se cose al
 * texto —es SQL, no un parámetro— y sus valores se suman a los de fuera. Sin esto, la
 * condición que limita un examinador a sus cursos pasaría por un simple `?` y la prueba no
 * distinguiría entre tenerla y no tenerla.
 */
function stitchSql(chunks: TemplateStringsArray, values: unknown[]) {
  let sql = '';
  const params: unknown[] = [];

  chunks.forEach((chunk, i) => {
    sql += chunk;
    if (i >= values.length) return;

    const value = values[i];
    if (isFragment(value)) {
      sql += value.sql;
      params.push(...value.values);
    } else {
      sql += '?';
      params.push(value);
    }
  });

  return { sql, values: params };
}

/**
 * Servicio con un doble de Prisma que **registra** lo que se le pide.
 * `totalCount` es lo que tiene el curso; el doble respeta el `take`, que es justamente lo
 * que se quiere comprobar.
 */
function recordingService(totalCount = 0, rawRows: unknown[] = [], finishedRows: unknown[] = []) {
  const queries: Query[] = [];
  const rawQueries: { sql: string; values: unknown[] }[] = [];
  let coursesQueried = 0;

  const prisma = {
    submission: {
      findMany: async (query: Query) => {
        queries.push(query);
        const count = Math.min(totalCount, query.take ?? totalCount);
        return Array.from({ length: count }, (_, i) => submission(i));
      },
    },
    $queryRaw: async (chunks: TemplateStringsArray, ...values: unknown[]) => {
      const query = stitchSql(chunks, values);
      rawQueries.push(query);
      // Las cifras de las matrículas terminadas se piden aparte del resto.
      return query.sql.includes('fecha_finalizacion IS NOT NULL') ? finishedRows : rawRows;
    },
  };

  const access = {
    managedCourse: async (courseGuid: string) => {
      coursesQueried++;
      return { guid: courseGuid, title: 'Manejo defensivo', passingScore: 80 };
    },
  };
  const storage = { downloadUrl: () => 'https://archivos/firmada' };

  const service = new AssessmentsService(
    prisma as never,
    storage as never,
    access as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, queries, rawQueries, coursesQueried: () => coursesQueried };
}

describe('cola de entregas del examinador', () => {
  it('no se consulta nada sin pasar antes por las reglas de acceso al curso', async () => {
    const { service, coursesQueried } = recordingService();
    await service.getSubmissionsToGrade(EXAMINER, { course: COURSE });

    // Es lo que impide que un examinador de México pida un curso de Colombia por su GUID.
    expect(coursesQueried()).toBe(1);
  });

  it('acota siempre al curso elegido, no a la sede entera', async () => {
    const { service, queries } = recordingService();
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(queries[0].where).toMatchObject({
      assignment: { quizConfig: null, module: { courseGuid: COURSE } },
    });
  });

  it('trae una página, no el curso entero', async () => {
    const { service, queries } = recordingService(5000);
    const { submissions } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(submissions).toHaveLength(50);
    // Pide una de más para saber si queda algo, pero no la entrega.
    expect(queries[0].take).toBe(51);
  });

  it('no deja pedir una página desmedida aunque la petición lo intente', async () => {
    const { service } = recordingService(100_000);
    const { submissions } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE, limit: 100_000 });

    expect(submissions).toHaveLength(MAX_PER_PAGE);
  });

  it('ordena por fecha y desempata por identificador, que es lo que hace estable la marca', async () => {
    const { service, queries } = recordingService(10);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(queries[0].orderBy).toEqual([{ submittedAt: 'desc' }, { guid: 'desc' }]);
  });

  it('devuelve marca mientras quede algo por traer', async () => {
    const { service } = recordingService(500);
    const { cursor } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(cursor).not.toBeNull();
  });

  it('no devuelve marca en la última página: es lo que dice que ya no queda nada', async () => {
    const { service } = recordingService(10);
    const { cursor } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(cursor).toBeNull();
  });

  it('continúa por donde iba la marca en lugar de repetir la primera página', async () => {
    const { service, queries } = recordingService(500);
    const date = new Date('2026-03-14T09:26:53.589Z');

    await service.getSubmissionsToGrade(ADMIN, {
      course: COURSE,
      cursor: encodeCursor(date, 'entrega-49'),
    });

    expect(queries[0].where).toMatchObject({
      AND: [
        expect.anything(),
        { OR: [{ submittedAt: { lt: date } }, { submittedAt: date, guid: { lt: 'entrega-49' } }] },
      ],
    });
  });

  it('una marca rota devuelve la primera página en vez de dejar la pantalla en blanco', async () => {
    const { service, queries } = recordingService(500);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE, cursor: 'esto-no-es-una-marca' });

    expect(queries[0].where).not.toHaveProperty('AND');
  });

  it('deja fuera los borradores: un intento a medias no es trabajo por corregir', async () => {
    const { service, queries } = recordingService(10);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(queries[0].where).toMatchObject({ status: { not: 'DRAFT' } });
  });

  it('el filtro de pendientes incluye las reenviadas, que vuelven a la cola', async () => {
    const { service, queries } = recordingService(10);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE, status: 'pending' });

    expect(queries[0].where).toMatchObject({ status: { in: ['SUBMITTED', 'IN_REVIEW'] } });
  });

  it('deja fuera las entregas de quien se dio de baja del curso', async () => {
    const { service, queries } = recordingService(10);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(queries[0].where).toMatchObject({
      user: { enrollments: { some: { courseGuid: COURSE, active: true } } },
    });
  });

  it('busca en el servidor, no sobre la página cargada', async () => {
    const { service, queries } = recordingService(10);
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE, search: '  ana  ' });

    expect(queries[0].where).toMatchObject({
      OR: [
        { user: { firstName: { contains: 'ana' } } },
        { user: { lastName: { contains: 'ana' } } },
        { assignment: { title: { contains: 'ana' } } },
      ],
    });
  });

  it('la marca no pisa al OR de la búsqueda: ambas condiciones siguen en pie', async () => {
    const { service, queries } = recordingService(500);
    const date = new Date('2026-03-14T09:26:53.589Z');

    await service.getSubmissionsToGrade(ADMIN, {
      course: COURSE,
      search: 'ana',
      cursor: encodeCursor(date, 'entrega-49'),
    });

    const where = queries[0].where as { AND: Record<string, unknown>[] };
    expect(where.AND[0]).toHaveProperty('OR');
    expect(where.AND[1]).toHaveProperty('OR');
  });
});

describe('cifras de las tareas por curso', () => {
  /** Los recuentos llegan de la base como BigInt y los decimales como cadena. */
  const courseRow = {
    courseGuid: COURSE,
    title: 'Manejo defensivo',
    coverImage: null,
    threshold: '80.00',
    borderline: '60',
    total: 3000n,
    graded: 1200n,
    low: 200n,
    mid: 400n,
    high: 600n,
  };

  it('cuenta el curso entero, no la página: 3.000 entregas con páginas de 50', async () => {
    const { service } = recordingService(0, [courseRow]);
    const [course] = await service.summarizeSubmissions(ADMIN);

    expect(course.total).toBe(3000);
    expect(course.graded).toBe(1200);
    expect(course.pending).toBe(1800);
  });

  it('traduce a números lo que la base devuelve como BigInt o cadena', async () => {
    const { service } = recordingService(0, [courseRow]);
    const [course] = await service.summarizeSubmissions(ADMIN);

    expect(course.threshold).toBe(80);
    expect(course.borderline).toBe(60);
    expect(course.scores).toEqual({ low: 200, mid: 400, high: 600 });
  });

  it('un administrador ve su sede entera y no filtra por profesor', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeSubmissions(ADMIN);

    expect(rawQueries[0].sql).toContain('c.pais');
    expect(rawQueries[0].sql).not.toContain('profesor_guid');
    expect(rawQueries[0].values).toContain('COLOMBIA');
  });

  it('un examinador sólo ve los cursos asignados a él', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeSubmissions(EXAMINER);

    expect(rawQueries[0].sql).toContain('c.profesor_guid');
    expect(rawQueries[0].values).toContain(EXAMINER.sub);
  });

  it('sólo cuenta entregas de alumnos con matrícula activa', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeSubmissions(ADMIN);

    expect(rawQueries[0].sql).toContain('mt.activa = 1');
  });

  it('suma las matrículas en curso y las terminadas: el total es el de la cola', async () => {
    const finished = { ...courseRow, total: 500n, graded: 500n, low: 0n, mid: 100n, high: 400n };
    const { service } = recordingService(0, [courseRow], [finished]);

    const [course] = await service.summarizeSubmissions(ADMIN);

    expect(course.total).toBe(3500);
    expect(course.graded).toBe(1700);
    expect(course.pending).toBe(1800);
    expect(course.scores).toEqual({ low: 200, mid: 500, high: 1000 });
  });

  it('lo de las matrículas terminadas se reutiliza un minuto; lo que está en curso se cuenta siempre', async () => {
    jest.useFakeTimers({ now: new Date('2026-03-01T10:00:00Z') });
    try {
      const { service, rawQueries } = recordingService(0, [courseRow]);
      const finishedQueries = () => rawQueries.filter((q) => q.sql.includes('fecha_finalizacion IS NOT NULL')).length;
      const liveQueries = () => rawQueries.filter((q) => q.sql.includes('fecha_finalizacion IS NULL')).length;

      await service.summarizeSubmissions(ADMIN);
      await service.summarizeSubmissions(ADMIN);
      expect(finishedQueries()).toBe(1);
      expect(liveQueries()).toBe(2);

      jest.setSystemTime(new Date('2026-03-01T10:01:01Z'));
      await service.summarizeSubmissions(ADMIN);
      expect(finishedQueries()).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cada examinador tiene su propia copia: no ve las cifras de los cursos de otro', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);

    await service.summarizeSubmissions(EXAMINER);
    await service.summarizeSubmissions(ADMIN);

    const finished = rawQueries.filter((q) => q.sql.includes('fecha_finalizacion IS NOT NULL'));
    expect(finished).toHaveLength(2);
    expect(finished[0].values).toContain(EXAMINER.sub);
    expect(finished[1].sql).not.toContain('profesor_guid');
  });
});

describe('cifras de los cuestionarios por curso', () => {
  const courseRow = {
    courseGuid: COURSE,
    title: 'Manejo defensivo',
    coverImage: null,
    threshold: '80.00',
    borderline: '60',
    attempts: '1500',
    assessed: 1000n,
    average: '74.4790',
    low: 216n,
    mid: 335n,
    high: 449n,
  };

  it('cuenta alumnos evaluados, no intentos: quien repitió no cuenta dos veces', async () => {
    const { service } = recordingService(0, [courseRow]);
    const [course] = await service.summarizeQuizzes(ADMIN);

    expect(course.attempts).toBe(1500);
    expect(course.assessed).toBe(1000);
    expect(course.passedCount).toBe(449);
    expect(course.failed).toBe(551);
  });

  it('acota el subconsulta por sede también por dentro, no sólo al final', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeQuizzes(EXAMINER);

    // Dos veces el país y dos el profesor: una por el curso y otra por la subconsulta que
    // calcula la mejor nota de cada alumno.
    expect(rawQueries[0].values.filter((value) => value === 'COLOMBIA')).toHaveLength(2);
    expect(rawQueries[0].values.filter((value) => value === EXAMINER.sub)).toHaveLength(2);
  });

  it('sólo cuenta intentos de alumnos con matrícula activa', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeQuizzes(ADMIN);

    expect(rawQueries[0].sql).toContain('mt.activa = 1');
  });

  it('toma la mejor nota de cada cuestionario y aprueba sólo con todos superados', async () => {
    const { service, rawQueries } = recordingService(0, [courseRow]);
    await service.summarizeQuizzes(ADMIN);

    const { sql } = rawQueries[0];
    // La mejor nota sale por alumno **y** cuestionario: la de uno no tapa el suspenso de otro.
    expect(sql).toContain('GROUP BY m.curso_guid, e.usuario_guid, e.tarea_guid');
    // Aprobados y tramos con la menor de esas mejores notas; el promedio, con su media.
    expect(sql).toContain('MIN(q.mejor) AS menor');
    expect(sql).toContain('SUM(a.menor >= c.nota_aprobacion)');
    expect(sql).toContain('AVG(a.media)');
  });
});

describe('historial de intentos de cuestionario', () => {
  const students = Array.from({ length: 51 }, (_, i) => ({
    userGuid: `alumno-${i}`,
    lastSubmittedAt: new Date(2026, 0, 1, 0, i),
  }));

  it('la página avanza por alumno, para no partir el historial de nadie', async () => {
    const { service, rawQueries, queries } = recordingService(150, students);
    await service.getQuizAttempts(ADMIN, { course: COURSE });

    // Primero una página de alumnos…
    expect(rawQueries[0].sql).toContain('GROUP BY q.userGuid');
    // …y después todos los intentos de esos alumnos, sin `take` que los corte.
    expect(queries[0].where).toMatchObject({ userGuid: { in: expect.any(Array) } });
    expect(queries[0].take).toBeUndefined();
  });

  it('pide un alumno de más para saber si queda alguno sin traer', async () => {
    const { service, rawQueries } = recordingService(150, students);
    await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(rawQueries[0].values).toContain(51);
  });

  it('la marca del alumno es su intento más reciente', async () => {
    const { service } = recordingService(150, students);
    const { cursor } = await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(cursor).toBe(encodeCursor(students[49].lastSubmittedAt, 'alumno-49'));
  });

  it('sin alumnos no pide intentos ni deja marca', async () => {
    const { service, queries } = recordingService(150, []);
    const { cursor, submissions } = await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(submissions).toEqual([]);
    expect(cursor).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('deja fuera a quien se dio de baja del curso', async () => {
    const { service, rawQueries } = recordingService(150, students);
    await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(rawQueries[0].sql).toContain('mt.activa = 1');
  });

  it('un curso ajeno no llega a consultarse', async () => {
    const { service, coursesQueried } = recordingService(0, []);
    await service.getQuizAttempts(EXAMINER, { course: COURSE });

    expect(coursesQueried()).toBe(1);
  });

  it('«Reprobados» es quien no alcanza el umbral con su mejor nota en algún cuestionario', async () => {
    const failed = recordingService(150, students);
    await failed.service.getQuizAttempts(ADMIN, { course: COURSE, result: 'failed' });
    const passed = recordingService(150, students);
    await passed.service.getQuizAttempts(ADMIN, { course: COURSE, result: 'passed' });

    // La mejor nota se calcula por cuestionario y decide la menor de ellas, no la mejor del curso.
    for (const { sql } of [failed.rawQueries[0], passed.rawQueries[0]]) {
      expect(sql).toContain('GROUP BY e.usuario_guid, e.tarea_guid');
      expect(sql).not.toContain('MAX(e.calificacion) <');
    }
    expect(failed.rawQueries[0].sql).toContain('MIN(q.best) <');
    expect(passed.rawQueries[0].sql).toContain('MIN(q.best) >=');
    expect(failed.rawQueries[0].values).toContain(80);
  });
});

/**
 * Calificar una tarea.
 *
 * Una tarea cuenta como completada para el certificado cuando tiene avance registrado. Ese
 * avance llega al aprobar, pero también por el desbloqueo tras 48 h de espera; si al
 * suspender no se retirara, la tarea suspendida seguiría contando como hecha y el alumno
 * podría certificarse sin aprobarla.
 */
describe('calificación de una tarea', () => {
  function gradingService({ enrolled = true } = {}) {
    const progress = new Set<string>(['alumno-1|tarea-1']);
    const recounts: unknown[][] = [];
    const steps: string[] = [];
    const transactionOptions: unknown[] = [];
    const prisma = {
      // El bloqueo de la matrícula, que devuelve si sigue activa.
      $queryRaw: async () => {
        steps.push('bloqueo');
        return [{ active: enrolled ? 1 : 0, completedAt: null }];
      },
      $transaction: async (work: (client: never) => Promise<unknown>, options: unknown) => {
        transactionOptions.push(options);
        return work(prisma as never);
      },
      submission: {
        update: jest.fn(async () => {
          steps.push('nota');
        }),
      },
      $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
        recounts.push(values.flatMap((value) => (isFragment(value) ? value.values : [value])));
        return 1;
      },
      resourceProgress: {
        upsert: async ({ create }: { create: { userGuid: string; resourceGuid: string } }) => {
          steps.push('avance');
          progress.add(`${create.userGuid}|${create.resourceGuid}`);
        },
        deleteMany: async ({ where }: { where: { userGuid: string; resourceGuid: string } }) => {
          steps.push('avance');
          progress.delete(`${where.userGuid}|${where.resourceGuid}`);
          return { count: 1 };
        },
      },
    };
    const access = {
      managedCourseOfSubmission: async () => ({
        submission: {
          guid: 'entrega-1',
          userGuid: 'alumno-1',
          assignmentGuid: 'tarea-1',
          status: 'SUBMITTED',
          score: null,
          assignment: { title: 'Informe de ruta', module: { courseGuid: COURSE } },
        },
        course: { guid: COURSE, title: 'Manejo defensivo', passingScore: 80 },
      }),
    };
    const realtime = { emitToUsers: () => undefined, emitToCourseStaff: () => undefined };
    const events = { emit: () => true };

    const service = new AssessmentsService(
      prisma as never,
      {} as never,
      access as never,
      {} as never,
      realtime as never,
      events as never,
      {} as never,
    );
    return { service, progress, recounts, prisma, steps, transactionOptions };
  }

  it('aprobar deja la tarea completada', async () => {
    const { service, progress } = gradingService();

    const result = await service.gradeSubmission('entrega-1', { score: 90 }, ADMIN);

    expect(result.passed).toBe(true);
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });

  it('suspender retira el avance que tuviera la tarea, aunque viniera del desbloqueo por espera', async () => {
    const { service, progress } = gradingService();

    const result = await service.gradeSubmission('entrega-1', { score: 40 }, ADMIN);

    expect(result.passed).toBe(false);
    expect(progress.has('alumno-1|tarea-1')).toBe(false);
  });

  it('aprobando o suspendiendo, recalcula el avance guardado en la matrícula del alumno', async () => {
    for (const score of [90, 40]) {
      const { service, recounts } = gradingService();

      await service.gradeSubmission('entrega-1', { score }, ADMIN);

      expect(recounts).toEqual([['alumno-1', COURSE]]);
    }
  });

  it('dos calificaciones a la vez van en fila: nota y avance se escriben con la matrícula bloqueada', async () => {
    for (const score of [90, 40]) {
      const { service, steps, transactionOptions } = gradingService();

      await service.gradeSubmission('entrega-1', { score }, ADMIN);

      // Si la nota y el avance se escribieran fuera, un suspenso podía quedar con el avance
      // de un aprobado que se calificó a la vez.
      expect(steps).toEqual(['bloqueo', 'nota', 'avance']);
      expect(transactionOptions).toEqual([{ isolationLevel: 'ReadCommitted' }]);
    }
  });

  it('no califica la entrega de quien se dio de baja del curso', async () => {
    const { service, prisma, progress } = gradingService({ enrolled: false });

    await expect(service.gradeSubmission('entrega-1', { score: 40 }, ADMIN)).rejects.toThrow(ForbiddenException);
    await expect(service.gradeSubmission('entrega-1', { score: 40 }, ADMIN)).rejects.toThrow(/ya no está matriculado/);
    expect(prisma.submission.update).not.toHaveBeenCalled();
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });
});

/**
 * Límite de la entrega de una tarea.
 *
 * El dueño del campus fija cada tarea con su propio límite —1 GB en una, 10 MB en otra—, y
 * sin límite propio rige el general de la sede. Aquí se fija que el archivo se reciba con
 * ese límite exacto y que nada se lea antes de saber que la entrega procede.
 */
describe('entrega de una tarea: límite de subida', () => {
  const STUDENT = sessionFor('STUDENT', 'COLOMBIA', 'alumno-1');

  interface Previous {
    guid: string;
    status: string;
    score: number | null;
    attachmentKey: string | null;
  }

  function submissionService({
    ownLimitMb = null,
    previous = null,
    failOnSave = false,
  }: { ownLimitMb?: number | null; previous?: Previous | null; failOnSave?: boolean } = {}) {
    // La entrega guardada del alumno: lo que confirma un envío lo ve el siguiente.
    let stored: Record<string, unknown> | null = previous && { ...previous };
    const writes: string[] = [];
    const save =
      (operation: string) =>
      async ({ data }: { data: Record<string, unknown> }) => {
        if (failOnSave) throw new Error('base de datos caída');
        writes.push(operation);
        stored = {
          guid: 'entrega-1',
          score: null,
          feedback: null,
          filePurged: false,
          attemptNumber: 1,
          ...stored,
          ...data,
        };
        return stored;
      };

    // El bloqueo de la matrícula: las transacciones corren de una en una, como con FOR UPDATE.
    let queue: Promise<unknown> = Promise.resolve();
    const prisma = {
      resource: {
        findUnique: async () => ({ title: 'Informe', type: 'ASSIGNMENT', quizConfig: null, maxUploadMb: ownLimitMb }),
      },
      submission: { findFirst: async () => stored, create: save('alta'), update: save('sustitución') },
      $queryRaw: async () => [{ active: 1, completedAt: null }],
      $transaction: (work: (client: never) => Promise<unknown>) => {
        const run = queue.then(() => work(prisma as never));
        queue = run.catch(() => undefined);
        return run;
      },
    };

    const uploads: { folder: string; uploader: unknown; maxBytes?: number }[] = [];
    const storage = {
      uploadFromDisk: async (_path: string, _name: string, folder: string, uploader: unknown, maxBytes?: number) => {
        uploads.push({ folder, uploader, maxBytes });
        return 'entregas/nueva.pdf';
      },
      downloadUrl: jest.fn(() => '/api/storage/download/entregas/nueva.pdf?exp=1&sig=x'),
    };
    const files = fileOwnershipDouble();
    const access = {
      unlockedResourceAccess: async () => ({
        guid: COURSE,
        title: 'Manejo defensivo',
        passingScore: 80,
        teacherGuid: 'profe-1',
      }),
    };
    const settings = { getMaxUploadMb: async () => 10 };
    const received: { isResubmission: boolean }[] = [];
    const events = {
      emit: (_name: string, event: { isResubmission: boolean }) => received.push(event),
    };

    const service = new AssessmentsService(
      prisma as never,
      storage as never,
      access as never,
      settings as never,
      {} as never,
      events as never,
      files.files,
    );
    const receive = jest.fn(async (_limit: UploadLimit) => ({ name: 'informe.pdf', filePath: '/tmp/subida' }));

    return { service, receive, uploads, storage, files, writes, received, stored: () => stored };
  }

  it('dos envíos a la vez de la misma tarea acaban en una sola entrega', async () => {
    const { service, receive, writes } = submissionService();

    // Un doble clic: los dos pasan la comprobación previa antes de que ninguno guarde.
    await Promise.all([
      service.recordSubmission('tarea-1', receive, STUDENT),
      service.recordSubmission('tarea-1', receive, STUDENT),
    ]);

    expect(writes).toEqual(['alta', 'sustitución']);
  });

  it('sustituir un reenvío que aún no se ha calificado lo deja como reenvío', async () => {
    const { service, receive, received, stored } = submissionService({
      previous: { guid: 'entrega-0', status: 'IN_REVIEW', score: 40, attachmentKey: 'entregas/corregida.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(stored()?.status).toBe('IN_REVIEW');
    expect(received).toEqual([expect.objectContaining({ isResubmission: true, previousScore: 40 })]);
  });

  it('sustituir una entrega sin calificar no la convierte en reenvío', async () => {
    const { service, receive, received, stored } = submissionService({
      previous: { guid: 'entrega-0', status: 'SUBMITTED', score: null, attachmentKey: 'entregas/primera.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(stored()?.status).toBe('SUBMITTED');
    expect(received).toEqual([expect.objectContaining({ isResubmission: false })]);
  });

  it('recibe el archivo con el límite propio de la tarea, aunque supere el general de la sede', async () => {
    const { service, receive, uploads } = submissionService({ ownLimitMb: 1024 });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: 1024 * MIB, message: 'El archivo supera el límite de 1 GB de esta tarea.' }),
    );
    expect(uploads).toEqual([{ folder: 'entregas', uploader: STUDENT, maxBytes: 1024 * MIB }]);
  });

  it('sin límite propio aplica el general de la sede', async () => {
    const { service, receive, uploads } = submissionService();

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: 10 * MIB, message: 'El archivo supera el límite de 10 MB de esta tarea.' }),
    );
    expect(uploads).toEqual([{ folder: 'entregas', uploader: STUDENT, maxBytes: 10 * MIB }]);
  });

  it('no lee el archivo de una entrega que ya está aprobada', async () => {
    const { service, receive } = submissionService({
      previous: { guid: 'entrega-0', status: 'GRADED', score: 90, attachmentKey: 'entregas/vieja.pdf' },
    });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(/ya fue aprobada/);
    expect(receive).not.toHaveBeenCalled();
  });

  it('retira el archivo guardado si no se puede registrar la entrega', async () => {
    const { service, receive, files } = submissionService({ failOnSave: true });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow('base de datos caída');
    expect(files.discarded).toHaveBeenCalledWith(['entregas/nueva.pdf']);
  });

  it('al reenviar retira el archivo anterior sólo si ya no lo usa nadie', async () => {
    const { service, receive, files } = submissionService({
      previous: { guid: 'entrega-0', status: 'GRADED', score: 40, attachmentKey: 'entregas/vieja.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(files.retired()).toEqual(['entregas/vieja.pdf']);
  });

  it('el enlace de descarga lleva el nombre original del archivo', async () => {
    const { service, receive, storage } = submissionService();

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(storage.downloadUrl).toHaveBeenCalledWith('entregas/nueva.pdf', 'informe.pdf');
  });
});
