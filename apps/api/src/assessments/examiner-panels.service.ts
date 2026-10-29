import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CourseAccessService } from '../courses/course-access.service';
import { AWAITING_GRADE } from '../courses/progression';
import { allowedAttemptsOf } from '../courses/quiz-config';
import { toScore, passingThreshold } from '../common/domain/grading';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { encodeCursor, rowsPerPage, decodeCursor, Cursor } from '../common/domain/pagination';
import { SubmissionQueueDto, AttemptQueueDto, QueueStatus } from './dto/examiner-queue.dto';
import { everyWord } from '../common/domain/search';
import { personSearchSql } from '../prisma/person-search';
import { deliveredFileUrl } from './delivered-file';

/** Campos que necesita el panel del examinador, iguales para tareas y cuestionarios. */
const DASHBOARD_SELECT = {
  guid: true,
  status: true,
  submittedAt: true,
  attachmentName: true,
  attachmentKey: true,
  filePurged: true,
  score: true,
  feedback: true,
  attemptNumber: true,
  user: { select: { guid: true, firstName: true, lastName: true, email: true } },
  assignment: {
    select: {
      guid: true,
      title: true,
      module: {
        select: {
          guid: true,
          title: true,
          course: { select: { guid: true, title: true, passingScore: true, coverImage: true } },
        },
      },
    },
  },
} satisfies Prisma.SubmissionSelect;

type DashboardSubmission = Prisma.SubmissionGetPayload<{ select: typeof DASHBOARD_SELECT }>;

/** Los recuentos llegan de la base como BigInt y los decimales como cadena. */
type CountValue = bigint | number | string;

/**
 * Cuánto se reutilizan las cifras de las matrículas ya terminadas en el panel de tareas.
 * Son historia —sólo cambian cuando alguien se certifica, se da de baja o vuelve a empezar—
 * y contarlas recorre todas las entregas de esos alumnos (segundos con años de datos).
 */
const FINISHED_TALLIES_TTL_MS = 60_000;

/** Entregas de un curso y reparto de sus notas. */
interface SubmissionTally {
  total: number;
  graded: number;
  low: number;
  mid: number;
  high: number;
}

/** Cifras de un curso comunes a los dos paneles del examinador. */
interface CourseRow {
  courseGuid: string;
  title: string;
  coverImage: string | null;
  threshold: CountValue;
  borderline: CountValue;
  low: CountValue;
  mid: CountValue;
  high: CountValue;
}

interface SubmissionsByCourseRow extends CourseRow {
  total: CountValue;
  graded: CountValue;
}

interface AttemptsByCourseRow extends CourseRow {
  attempts: CountValue;
  assessed: CountValue;
  average: CountValue;
}

/** Qué entra en la cola. Un borrador es un intento a medias, no trabajo por corregir. */
function queueStatusFilter(status?: QueueStatus): Prisma.SubmissionWhereInput['status'] {
  if (status === 'pending') return { in: AWAITING_GRADE };
  if (status === 'graded') return 'GRADED';
  return { not: 'DRAFT' };
}

/** Lo que queda por detrás de la marca, en el mismo orden en que se pide la página. */
function fromCursor(cursor: Cursor): Prisma.SubmissionWhereInput {
  return { OR: [{ submittedAt: { lt: cursor.date } }, { submittedAt: cursor.date, guid: { lt: cursor.id } }] };
}

/** Por dónde sigue la página siguiente. */
function lastItemCursor(page: { guid: string; submittedAt: Date | null }[]): string | null {
  const last = page[page.length - 1];
  return last?.submittedAt ? encodeCursor(last.submittedAt, last.guid) : null;
}

/** Datos del curso que acompañan a sus cifras, iguales en los dos paneles. */
function courseHeader(row: CourseRow) {
  return {
    courseGuid: row.courseGuid,
    title: row.title,
    coverImage: row.coverImage,
    threshold: passingThreshold(row.threshold),
    borderline: Number(row.borderline),
  };
}

/** Reparto de las notas en los tres tramos que dibuja la gráfica de barras. */
function rangesOf(row: CourseRow) {
  return { low: Number(row.low), mid: Number(row.mid), high: Number(row.high) };
}

function tallyOf(row: SubmissionsByCourseRow): SubmissionTally {
  return { total: Number(row.total), graded: Number(row.graded), ...rangesOf(row) };
}

/**
 * Paneles del examinador de tareas y de cuestionarios: las colas, por página, y las cifras de
 * cada curso.
 *
 * Sólo cuentan a los alumnos con matrícula activa en el curso: a quien se dio de baja no se le
 * corrige ni se le cuenta.
 */
@Injectable()
export class ExaminerPanelsService {
  /** Cifras de las matrículas terminadas por alcance (sede, y profesor si es examinador). */
  private readonly finishedTallies = new Map<
    string,
    { expiresAt: number; tallies: Promise<Map<string, SubmissionTally>> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: CourseAccessService,
  ) {}

  /**
   * Cola de corrección de un curso, por página. Avanza con una marca de la última entrega
   * devuelta; ver `common/domain/pagination`.
   *
   * Las cifras y las gráficas no se sacan de esta lista sino de `summarizeSubmissions`:
   * contarlas sobre una página describiría lo cargado, no el curso.
   */
  async getSubmissionsToGrade(user: JwtPayload, filter: SubmissionQueueDto) {
    await this.access.managedCourse(filter.course, user);

    const take = rowsPerPage(filter.limit);
    const cursor = decodeCursor(filter.cursor);
    const matchFilter: Prisma.SubmissionWhereInput = {
      assignment: { quizConfig: null, module: { courseGuid: filter.course } },
      user: { enrollments: { some: { courseGuid: filter.course, active: true } } },
      status: queueStatusFilter(filter.status),
      // Cada palabra en el nombre o los apellidos del alumno, o en el título de la tarea.
      ...everyWord<Prisma.SubmissionWhereInput>(filter.search, (word) => [
        { user: { firstName: { contains: word } } },
        { user: { lastName: { contains: word } } },
        { assignment: { title: { contains: word } } },
      ]),
    };

    const rows = await this.prisma.submission.findMany({
      // La marca va dentro de un `AND`: al mismo nivel pisaría al `OR` de la búsqueda.
      where: cursor ? { AND: [matchFilter, fromCursor(cursor)] } : matchFilter,
      // El identificador desempata: sin él, dos entregas del mismo milisegundo podrían
      // repetirse o perderse al pasar de página.
      orderBy: [{ submittedAt: 'desc' }, { guid: 'desc' }],
      take: take + 1, // uno de más: así se sabe si queda algo sin pedir otra página
      select: DASHBOARD_SELECT,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const certified = await this.certifiedStudents(filter.course, page);

    return {
      cursor: hasMore ? lastItemCursor(page) : null,
      submissions: page.map((submission) => this.forExaminer(submission, certified)),
    };
  }

  /** Autores de las entregas indicadas cuya vuelta en el curso ya está certificada. */
  private async certifiedStudents(courseGuid: string, submissions: DashboardSubmission[]): Promise<Set<string>> {
    if (submissions.length === 0) return new Set();

    const certified = await this.prisma.enrollment.findMany({
      where: {
        courseGuid,
        userGuid: { in: [...new Set(submissions.map((submission) => submission.user.guid))] },
        completedAt: { not: null },
      },
      select: { userGuid: true },
    });
    return new Set(certified.map((enrollment) => enrollment.userGuid));
  }

  /**
   * Cifras del panel de tareas: una fila por curso gestionado, con ceros incluidos.
   * Son los contadores del selector de curso, el anillo de progreso y las barras de notas.
   *
   * Cuentan las entregas de todos los matriculados activos, igual que la cola, pero se
   * suman en dos partes: la de las matrículas **en curso**, que es donde se corrige y se
   * cuenta en cada petición, y la de las **terminadas**, que es historia y se reutiliza
   * durante un minuto (`FINISHED_TALLIES_TTL_MS`). Así el coste de cada petición sigue al
   * trabajo vivo y no a los años acumulados. Al certificarse alguien, sus entregas pueden
   * faltar en el total durante ese minuto.
   */
  async summarizeSubmissions(user: JwtPayload) {
    // Una tras otra y no a la vez: cada una ocupa una conexión mientras dura.
    const live = await this.submissionsByCourse(user, false);
    const finished = await this.finishedSubmissions(user);

    return live.map((row) => {
      const now = tallyOf(row);
      const past = finished.get(row.courseGuid) ?? { total: 0, graded: 0, low: 0, mid: 0, high: 0 };
      const total = now.total + past.total;
      const graded = now.graded + past.graded;

      return {
        ...courseHeader(row),
        total,
        graded,
        pending: total - graded,
        scores: { low: now.low + past.low, mid: now.mid + past.mid, high: now.high + past.high },
      };
    });
  }

  /** Cifras de las matrículas terminadas del alcance de quien consulta, guardadas un minuto. */
  private finishedSubmissions(user: JwtPayload): Promise<Map<string, SubmissionTally>> {
    const key = `${user.country}|${user.role === 'TEACHER' ? user.sub : '*'}`;
    const cached = this.finishedTallies.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.tallies;

    // Se guarda la promesa y no el resultado: varias peticiones a la vez comparten un cálculo.
    const tallies = this.submissionsByCourse(user, true).then(
      (rows) => new Map(rows.map((row) => [row.courseGuid, tallyOf(row)])),
    );
    this.finishedTallies.set(key, { expiresAt: Date.now() + FINISHED_TALLIES_TTL_MS, tallies });
    // Un fallo no se guarda: la siguiente petición lo vuelve a intentar.
    tallies.catch(() => this.finishedTallies.delete(key));
    return tallies;
  }

  /**
   * Entregas por curso de las matrículas activas en curso o de las ya terminadas. Parte de
   * las matrículas (índice por curso, activa y fecha de fin) y busca las entregas de cada
   * alumno en las tareas del curso: no recorre las entregas de quien no entra en la cuenta.
   */
  private submissionsByCourse(user: JwtPayload, finished: boolean) {
    const phase = finished ? Prisma.sql`IS NOT NULL` : Prisma.sql`IS NULL`;

    return this.prisma.$queryRaw<SubmissionsByCourseRow[]>`
      SELECT c.guid AS courseGuid, c.titulo AS title, c.imagen_portada AS coverImage,
             c.nota_aprobacion AS threshold, ROUND(c.nota_aprobacion * 0.75) AS borderline,
             COUNT(e.guid) AS total,
             COALESCE(SUM(e.estado = 'CALIFICADA'), 0) AS graded,
             COALESCE(SUM(e.estado = 'CALIFICADA' AND e.calificacion >= c.nota_aprobacion), 0) AS high,
             COALESCE(SUM(e.estado = 'CALIFICADA' AND e.calificacion >= ROUND(c.nota_aprobacion * 0.75)
                          AND e.calificacion < c.nota_aprobacion), 0) AS mid,
             COALESCE(SUM(e.estado = 'CALIFICADA' AND e.calificacion < ROUND(c.nota_aprobacion * 0.75)), 0) AS low
      FROM lms_cursos c
      LEFT JOIN lms_matriculas mt ON mt.curso_guid = c.guid AND mt.activa = 1 AND mt.fecha_finalizacion ${phase}
      LEFT JOIN lms_modulos m ON m.curso_guid = c.guid
      LEFT JOIN lms_recursos r ON r.modulo_guid = m.guid AND r.quiz_config IS NULL
      LEFT JOIN lms_entregas e ON e.tarea_guid = r.guid AND e.usuario_guid = mt.usuario_guid AND e.estado <> 'BORRADOR'
      WHERE c.pais = ${user.country} ${this.ownOnly(user)}
      GROUP BY c.guid, c.titulo, c.imagen_portada, c.nota_aprobacion, c.created_at
      ORDER BY c.created_at DESC`;
  }

  /**
   * Intentos de cuestionario de un curso, por página **de alumnos**.
   *
   * Van por separado de las entregas porque son otra cosa: se corrigen solos y lo que
   * interesa de ellos es el resultado, no la cola de trabajo pendiente. La página avanza
   * por alumno y no por intento porque la pantalla cuenta cuántas veces se presentó cada
   * uno y con qué mejor nota: partir el historial de una persona entre dos páginas daría
   * un recuento falso. De cada alumno de la página vienen todos sus intentos.
   *
   * Aprueba quien alcanza el umbral con su mejor nota en **cada** cuestionario presentado:
   * la mejor de uno no compensa el suspenso de otro. Cada intento lleva los intentos permitidos
   * de su cuestionario, para saber a quién se le agotaron.
   */
  async getQuizAttempts(user: JwtPayload, filter: AttemptQueueDto) {
    const course = await this.access.managedCourse(filter.course, user);

    const take = rowsPerPage(filter.limit);
    const cursor = decodeCursor(filter.cursor);
    const threshold = passingThreshold(course.passingScore);
    const byName = personSearchSql(filter.search);

    // Un `HAVING` siempre presente evita tener que componer la cláusula en dos trozos. La
    // menor de sus mejores notas decide: si no llega, algún cuestionario está sin superar.
    const byResult =
      filter.result === 'passed'
        ? Prisma.sql`AND MIN(q.best) >= ${threshold}`
        : filter.result === 'failed'
          ? Prisma.sql`AND MIN(q.best) < ${threshold}`
          : Prisma.empty;

    // La marca de un alumno es su intento más reciente; el identificador vuelve a desempatar.
    const sinceLastAttempt = cursor
      ? Prisma.sql`AND (MAX(q.lastSubmittedAt) < ${cursor.date}
                        OR (MAX(q.lastSubmittedAt) = ${cursor.date} AND q.userGuid < ${cursor.id}))`
      : Prisma.empty;

    const students = await this.prisma.$queryRaw<{ userGuid: string; lastSubmittedAt: Date }[]>`
      SELECT q.userGuid, MAX(q.lastSubmittedAt) AS lastSubmittedAt
      FROM (
        SELECT e.usuario_guid AS userGuid, MAX(e.calificacion) AS best, MAX(e.fecha_entrega) AS lastSubmittedAt
        FROM lms_entregas e
        JOIN lms_recursos r ON r.guid = e.tarea_guid AND r.quiz_config IS NOT NULL
        JOIN lms_modulos m ON m.guid = r.modulo_guid
        JOIN lms_matriculas mt ON mt.usuario_guid = e.usuario_guid AND mt.curso_guid = m.curso_guid AND mt.activa = 1
        JOIN usuarios u ON u.guid = e.usuario_guid
        WHERE m.curso_guid = ${filter.course} AND e.estado = 'CALIFICADA' ${byName}
        GROUP BY e.usuario_guid, e.tarea_guid
      ) q
      GROUP BY q.userGuid
      HAVING TRUE ${byResult} ${sinceLastAttempt}
      ORDER BY lastSubmittedAt DESC, q.userGuid DESC
      LIMIT ${take + 1}`;

    const hasMore = students.length > take;
    const page = hasMore ? students.slice(0, take) : students;
    if (page.length === 0) return { cursor: null, submissions: [] };

    const attempts = await this.prisma.submission.findMany({
      where: {
        status: 'GRADED',
        userGuid: { in: page.map((student) => student.userGuid) },
        assignment: { quizConfig: { not: null }, module: { courseGuid: filter.course } },
      },
      orderBy: [{ submittedAt: 'desc' }, { guid: 'desc' }],
      select: DASHBOARD_SELECT,
    });

    const last = page[page.length - 1];
    const [certified, allowedAttempts] = await Promise.all([
      this.certifiedStudents(filter.course, attempts),
      this.allowedAttemptsByQuiz(attempts),
    ]);

    return {
      cursor: hasMore ? encodeCursor(last.lastSubmittedAt, last.userGuid) : null,
      submissions: attempts.map((attempt) => ({
        ...this.forExaminer(attempt, certified),
        assignmentTitle: attempt.assignment?.title ?? 'Cuestionario eliminado',
        allowedAttempts: attempt.assignment ? (allowedAttempts.get(attempt.assignment.guid) ?? null) : null,
      })),
    };
  }

  /** Intentos permitidos de los cuestionarios de esos intentos, leyendo una vez cada configuración. */
  private async allowedAttemptsByQuiz(attempts: DashboardSubmission[]): Promise<Map<string, number | null>> {
    const quizGuids = new Set(attempts.flatMap((attempt) => (attempt.assignment ? [attempt.assignment.guid] : [])));
    const quizzes = await this.prisma.resource.findMany({
      where: { guid: { in: [...quizGuids] } },
      select: { guid: true, quizConfig: true },
    });
    return new Map(quizzes.map((quiz) => [quiz.guid, allowedAttemptsOf(quiz.quizConfig)]));
  }

  /**
   * Cifras del panel de cuestionarios: una fila por curso gestionado.
   *
   * Todo se cuenta sobre la **mejor nota de cada alumno en cada cuestionario**, no sobre
   * cada intento: contar intentos infla el total y hunde el promedio de quien repitió. Por
   * eso agrupa tres veces: por cuestionario, por alumno y por curso.
   *
   * De cada alumno cuentan la media de esas mejores notas (el promedio) y la menor de ellas,
   * que decide si aprueba —tiene que superar todos los cuestionarios que presentó— y en qué
   * tramo de la gráfica cae. Así los tramos suman lo mismo que aprobados y reprobados.
   */
  async summarizeQuizzes(user: JwtPayload) {
    const rows = await this.prisma.$queryRaw<AttemptsByCourseRow[]>`
      SELECT c.guid AS courseGuid, c.titulo AS title, c.imagen_portada AS coverImage,
             c.nota_aprobacion AS threshold, ROUND(c.nota_aprobacion * 0.75) AS borderline,
             COALESCE(SUM(a.intentos), 0) AS attempts,
             COUNT(a.menor) AS assessed,
             COALESCE(AVG(a.media), 0) AS average,
             COALESCE(SUM(a.menor >= c.nota_aprobacion), 0) AS high,
             COALESCE(SUM(a.menor >= ROUND(c.nota_aprobacion * 0.75) AND a.menor < c.nota_aprobacion), 0) AS mid,
             COALESCE(SUM(a.menor < ROUND(c.nota_aprobacion * 0.75)), 0) AS low
      FROM lms_cursos c
      LEFT JOIN (
        SELECT q.curso_guid, q.usuario_guid,
               SUM(q.intentos) AS intentos, MIN(q.mejor) AS menor, AVG(q.mejor) AS media
        FROM (
          SELECT m.curso_guid AS curso_guid, e.usuario_guid AS usuario_guid,
                 COUNT(*) AS intentos, MAX(e.calificacion) AS mejor
          FROM lms_entregas e
          JOIN lms_recursos r ON r.guid = e.tarea_guid AND r.quiz_config IS NOT NULL
          JOIN lms_modulos m ON m.guid = r.modulo_guid
          JOIN lms_cursos c2 ON c2.guid = m.curso_guid AND c2.pais = ${user.country} ${this.ownOnly(user, 'c2')}
          JOIN lms_matriculas mt ON mt.usuario_guid = e.usuario_guid AND mt.curso_guid = m.curso_guid AND mt.activa = 1
          WHERE e.estado = 'CALIFICADA'
          GROUP BY m.curso_guid, e.usuario_guid, e.tarea_guid
        ) q
        GROUP BY q.curso_guid, q.usuario_guid
      ) a ON a.curso_guid = c.guid
      WHERE c.pais = ${user.country} ${this.ownOnly(user)}
      GROUP BY c.guid, c.titulo, c.imagen_portada, c.nota_aprobacion, c.created_at
      ORDER BY c.created_at DESC`;

    return rows.map((row) => {
      const assessed = Number(row.assessed);
      const passedCount = Number(row.high);

      return {
        ...courseHeader(row),
        attempts: Number(row.attempts),
        assessed,
        passedCount,
        failed: assessed - passedCount,
        average: Number(row.average),
        scores: rangesOf(row),
      };
    });
  }

  /**
   * Alcance de lo que puede ver quien consulta: la sede la fija el `WHERE` de cada
   * consulta y esto añade la otra mitad, que un examinador sólo ve sus propios cursos.
   */
  private ownOnly(user: JwtPayload, table: 'c' | 'c2' = 'c'): Prisma.Sql {
    if (user.role !== 'TEACHER') return Prisma.empty;
    return table === 'c'
      ? Prisma.sql`AND c.profesor_guid = ${user.sub}`
      : Prisma.sql`AND c2.profesor_guid = ${user.sub}`;
  }

  /**
   * Proyección común del panel: el archivo sale como URL firmada y la nota, normalizada.
   * `roundClosed` dice que la vuelta del alumno ya está certificada y su nota no se toca.
   */
  private forExaminer(submission: DashboardSubmission, certified: Set<string>) {
    return {
      guid: submission.guid,
      status: submission.status,
      submittedAt: submission.submittedAt,
      attemptNumber: submission.attemptNumber,
      score: toScore(submission.score),
      feedback: submission.feedback,
      passingScore: passingThreshold(submission.assignment?.module.course.passingScore),
      fileName: submission.attachmentName,
      fileUrl: deliveredFileUrl(this.storage, submission),
      filePurged: submission.filePurged,
      roundClosed: certified.has(submission.user.guid),
      student: submission.user,
      assignmentGuid: submission.assignment?.guid ?? null,
      assignmentTitle: submission.assignment?.title ?? 'Tarea eliminada',
      moduleGuid: submission.assignment?.module.guid ?? null,
      moduleTitle: submission.assignment?.module.title ?? null,
      courseGuid: submission.assignment?.module.course.guid ?? null,
      courseTitle: submission.assignment?.module.course.title ?? null,
      courseImage: submission.assignment?.module.course.coverImage ?? null,
    };
  }
}
