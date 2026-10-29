import { encodeCursor, MAX_PER_PAGE } from '../common/domain/pagination';
import { sessionFor } from '../common/testing/test-campus';
import { ExaminerPanelsService } from './examiner-panels.service';

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
function recordingService(
  totalCount = 0,
  rawRows: unknown[] = [],
  finishedRows: unknown[] = [],
  certifiedStudents: string[] = [],
) {
  const queries: Query[] = [];
  const rawQueries: { sql: string; values: unknown[] }[] = [];
  const enrollmentQueries: Query[] = [];
  let coursesQueried = 0;

  const prisma = {
    submission: {
      findMany: async (query: Query) => {
        queries.push(query);
        const count = Math.min(totalCount, query.take ?? totalCount);
        return Array.from({ length: count }, (_, i) => submission(i));
      },
    },
    enrollment: {
      findMany: async (query: Query) => {
        enrollmentQueries.push(query);
        return certifiedStudents.map((userGuid) => ({ userGuid }));
      },
    },
    resource: { findMany: async () => [] },
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

  const service = new ExaminerPanelsService(prisma as never, storage as never, access as never);

  return { service, queries, rawQueries, enrollmentQueries, coursesQueried: () => coursesQueried };
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
    await service.getSubmissionsToGrade(ADMIN, { course: COURSE, search: '  ana  informe ' });

    // Cada palabra en el nombre o los apellidos del alumno, o en el título de la tarea.
    const byWord = (word: string) => ({
      OR: [
        { user: { firstName: { contains: word } } },
        { user: { lastName: { contains: word } } },
        { assignment: { title: { contains: word } } },
      ],
    });
    expect(queries[0].where).toMatchObject({ AND: [byWord('ana'), byWord('informe')] });
  });

  it('la marca no pisa a la búsqueda: ambas condiciones siguen en pie', async () => {
    const { service, queries } = recordingService(500);
    const date = new Date('2026-03-14T09:26:53.589Z');

    await service.getSubmissionsToGrade(ADMIN, {
      course: COURSE,
      search: 'ana',
      cursor: encodeCursor(date, 'entrega-49'),
    });

    const where = queries[0].where as { AND: Record<string, unknown>[] };
    expect(where.AND[0]).toHaveProperty('AND');
    expect(where.AND[1]).toHaveProperty('OR');
  });
});

describe('cola del examinador: vueltas certificadas y archivos retirados', () => {
  it('marca las entregas de quien ya tiene el certificado de su vuelta: su nota ya no se toca', async () => {
    const { service, enrollmentQueries } = recordingService(2, [], [], ['alumno-1']);

    const { submissions } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(submissions.map((row) => row.roundClosed)).toEqual([false, true]);
    expect(enrollmentQueries[0].where).toEqual({
      courseGuid: COURSE,
      userGuid: { in: ['alumno-0', 'alumno-1'] },
      completedAt: { not: null },
    });
  });

  it('lo mismo en el historial de intentos de cuestionario', async () => {
    const { service } = recordingService(2, [{ userGuid: 'alumno-0', lastSubmittedAt: new Date() }], [], ['alumno-0']);

    const { submissions } = await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(submissions.map((row) => row.roundClosed)).toEqual([true, false]);
  });

  it('una entrega cuyo archivo se retiró no ofrece enlace de descarga', async () => {
    const { service } = recordingService(1);
    const purged = { ...submission(0), attachmentKey: 'entregas/informe.pdf', filePurged: true };
    jest.spyOn(service['prisma'].submission, 'findMany').mockResolvedValueOnce([purged] as never);

    const { submissions } = await service.getSubmissionsToGrade(ADMIN, { course: COURSE });

    expect(submissions[0]).toMatchObject({ fileName: 'informe.pdf', fileUrl: null, filePurged: true });
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

  it('cada intento lleva los intentos permitidos de su cuestionario, leídos una vez por cuestionario', async () => {
    const { service } = recordingService(3, students);
    const options = [
      { id: 'a', texto: 'Sí', es_correcta: true },
      { id: 'b', texto: 'No', es_correcta: false },
    ];
    const config = JSON.stringify({
      intentos_permitidos: 2,
      tiempo_minutos: 0,
      preguntas: [{ id: 'p1', enunciado: '¿Cinturón siempre?', opciones: options }],
    });
    const findQuizzes = jest
      .spyOn(service['prisma'].resource, 'findMany')
      .mockResolvedValueOnce([{ guid: 'tarea-1', quizConfig: config }] as never);

    const { submissions } = await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(submissions.map((row) => row.allowedAttempts)).toEqual([2, 2, 2]);
    expect(findQuizzes).toHaveBeenCalledTimes(1);
    expect(findQuizzes.mock.calls[0][0]).toMatchObject({ where: { guid: { in: ['tarea-1'] } } });
  });

  it('un cuestionario con la configuración dañada no se da por ilimitado', async () => {
    const { service } = recordingService(1, students);
    jest
      .spyOn(service['prisma'].resource, 'findMany')
      .mockResolvedValueOnce([{ guid: 'tarea-1', quizConfig: '{roto' }] as never);

    const { submissions } = await service.getQuizAttempts(ADMIN, { course: COURSE });

    expect(submissions[0].allowedAttempts).toBeNull();
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
