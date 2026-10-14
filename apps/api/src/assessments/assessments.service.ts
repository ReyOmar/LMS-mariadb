import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Submission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FileOwnershipService } from '../storage/file-ownership.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { CourseAccessService, UNENROLLED_MESSAGE } from '../courses/course-access.service';
import { recordCompletion, refreshCompletedResources } from '../courses/resource-progress';
import { AWAITING_GRADE } from '../courses/progression';
import { QuizConfig, allowedAttemptsOf, parseQuizConfig, quizDisplayTitle } from '../courses/quiz-config';
import { attemptsExhausted, usedAttempts } from '../courses/quiz.service';
import {
  AFTER_LOCK,
  ClosedRoundMessages,
  LockedEnrollment,
  assertRoundOpen,
  lockEnrollment,
} from '../enrollments/enrollment-lock';
import { toScore, isPassing, formatScore, normalizeScore, passingThreshold } from '../common/domain/grading';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { FileReceiver } from '../storage/multipart';
import { uploadLimit } from '../storage/upload-limits';
import { encodeCursor, rowsPerPage, decodeCursor, Cursor } from '../common/domain/pagination';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionQueueDto, AttemptQueueDto, QueueStatus } from './dto/examiner-queue.dto';
import { emitEvent } from '../common/domain/domain-events';
import { searchTerm } from '../common/domain/search';

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

const SUBMISSIONS_CLOSED: ClosedRoundMessages = {
  unenrolled: UNENROLLED_MESSAGE,
  certified: 'Ya terminaste este curso: tus entregas quedaron cerradas con tu certificado.',
};

const GRADING_CLOSED: ClosedRoundMessages = {
  unenrolled: 'Este alumno ya no está matriculado en el curso: no puedes calificar su entrega.',
  certified: 'La vuelta de este alumno ya está certificada: su calificación no puede cambiarse.',
};

const NEW_ATTEMPT_CLOSED: ClosedRoundMessages = {
  unenrolled: 'Este alumno ya no está matriculado en el curso: no puedes habilitarle otro intento.',
  certified: 'La vuelta de este alumno ya está certificada: no puedes habilitarle otro intento.',
};

/** Lo que se mira de la entrega anterior de un alumno al recibir otra. */
const OWN_SUBMISSION_SELECT = {
  guid: true,
  status: true,
  score: true,
  attachmentKey: true,
} satisfies Prisma.SubmissionSelect;

type OwnSubmission = Prisma.SubmissionGetPayload<{ select: typeof OWN_SUBMISSION_SELECT }>;

/** Una entrega aprobada no se sustituye: respalda una nota ya dada. */
function ensureReplaceable(previous: OwnSubmission | null, threshold: number): void {
  if (previous?.status === 'GRADED' && isPassing(previous.score, threshold)) {
    throw new BadRequestException(
      `Tu entrega ya fue aprobada con ${formatScore(previous.score)}. No necesitas volver a enviarla.`,
    );
  }
}

/**
 * Entregas de tareas —subida por el alumno y calificación por el examinador— y paneles del
 * examinador de tareas y de cuestionarios.
 *
 * Los paneles sólo cuentan a los alumnos con matrícula activa en el curso: a quien se dio
 * de baja no se le corrige ni se le cuenta.
 */
@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  /** Cifras de las matrículas terminadas por alcance (sede, y profesor si es examinador). */
  private readonly finishedTallies = new Map<
    string,
    { expiresAt: number; tallies: Promise<Map<string, SubmissionTally>> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: CourseAccessService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
    private readonly events: EventEmitter2,
    private readonly files: FileOwnershipService,
  ) {}

  // ── Alumno ───────────────────────────────────────────────────────────────

  /**
   * Registra la entrega de una tarea. Se puede reenviar mientras no esté aprobada: una aprobada
   * no se sustituye, porque respalda una nota ya dada. El archivo se recibe al final, cuando ya
   * se sabe que la entrega procede y cuál es su límite (el de la tarea o el general de la sede).
   */
  async recordSubmission(assignmentGuid: string, receive: FileReceiver, user: JwtPayload) {
    const course = await this.access.unlockedResourceAccess(assignmentGuid, user);
    const threshold = passingThreshold(course.passingScore);

    const assignment = await this.prisma.resource.findUnique({
      where: { guid: assignmentGuid },
      select: { title: true, type: true, quizConfig: true, maxUploadMb: true },
    });
    if (!assignment || assignment.type !== 'ASSIGNMENT') {
      throw new BadRequestException('Este recurso no admite entregas.');
    }
    if (assignment.quizConfig) {
      throw new BadRequestException('Este recurso es un cuestionario: se resuelve en línea, no se sube archivo.');
    }

    // Antes de recibir el archivo, para no aceptar en balde uno que puede pesar varios GB.
    assertRoundOpen(await this.enrollmentOf(user.sub, course.guid), SUBMISSIONS_CLOSED);
    ensureReplaceable(await this.ownSubmission(this.prisma, assignmentGuid, user.sub), threshold);

    const limit = uploadLimit('entregas', assignment.maxUploadMb ?? (await this.settings.getMaxUploadMb(user.country)));
    const file = await receive(limit);
    const key = await this.storage.uploadFromDisk(file.filePath, file.name, 'entregas', user, limit.bytes);

    const attachment = { attachmentKey: key, attachmentName: file.name };
    const { submission, previous } = await this.files.adoptUpload(
      key,
      () => this.saveDelivery({ assignmentGuid, courseGuid: course.guid, userGuid: user.sub, threshold }, attachment),
      (saved) => saved.previous?.attachmentKey,
    );

    emitEvent(this.events, 'submission.received', {
      submissionGuid: submission.guid,
      userGuid: user.sub,
      country: user.country,
      assignmentTitle: assignment.title,
      courseTitle: course.title,
      teacherGuid: course.teacherGuid,
      isResubmission: submission.status === 'IN_REVIEW',
      previousScore: toScore(previous?.score),
    });

    return this.forStudent(submission);
  }

  /**
   * Con la matrícula bloqueada: dos envíos a la vez se ponen en fila y el segundo sustituye al
   * primero, y uno que llega tras la baja o el certificado se rechaza.
   */
  private saveDelivery(
    target: { assignmentGuid: string; courseGuid: string; userGuid: string; threshold: number },
    attachment: { attachmentKey: string; attachmentName: string },
  ) {
    const { assignmentGuid, courseGuid, userGuid, threshold } = target;
    return this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, userGuid, courseGuid), SUBMISSIONS_CLOSED);
      const previous = await this.ownSubmission(tx, assignmentGuid, userGuid);
      ensureReplaceable(previous, threshold);

      const delivery = { ...attachment, submittedAt: new Date() };
      const submission = previous
        ? await tx.submission.update({
            where: { guid: previous.guid },
            // Una versión corregida tras una nota insuficiente sigue siendo un reenvío
            // aunque se sustituya antes de que la califiquen.
            data: {
              ...delivery,
              status: previous.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_REVIEW',
              filePurged: false,
            },
          })
        : await tx.submission.create({ data: { ...delivery, assignmentGuid, userGuid, status: 'SUBMITTED' } });
      return { submission, previous };
    }, AFTER_LOCK);
  }

  private enrollmentOf(userGuid: string, courseGuid: string): Promise<LockedEnrollment | null> {
    return this.prisma.enrollment.findUnique({
      where: { userGuid_courseGuid: { userGuid, courseGuid } },
      select: { active: true, completedAt: true },
    });
  }

  /** La entrega del alumno en una tarea, si ya la tiene: cada tarea admite una por alumno. */
  private ownSubmission(db: Prisma.TransactionClient, assignmentGuid: string, userGuid: string) {
    return db.submission.findFirst({ where: { assignmentGuid, userGuid }, select: OWN_SUBMISSION_SELECT });
  }

  /** Entrega del alumno en sesión para una tarea concreta. */
  async getMySubmission(assignmentGuid: string, user: JwtPayload) {
    await this.access.ensureResourceAccess(assignmentGuid, user);

    const submission = await this.prisma.submission.findFirst({
      where: { assignmentGuid, userGuid: user.sub },
    });
    return submission ? this.forStudent(submission) : { status: 'PENDING' as const };
  }

  /**
   * El archivo entregado, como URL firmada y caducable y nunca como clave suelta: la clave sola
   * permitiría a cualquiera descargarlo. Ninguna si se retiró al emitirse el certificado.
   */
  private deliveredFileUrl(submission: Pick<Submission, 'attachmentKey' | 'attachmentName' | 'filePurged'>) {
    if (submission.filePurged || !submission.attachmentKey) return null;
    return this.storage.downloadUrl(submission.attachmentKey, submission.attachmentName);
  }

  /** Proyección de una entrega hacia su autor. */
  private forStudent(
    submission: Pick<
      Submission,
      | 'guid'
      | 'status'
      | 'submittedAt'
      | 'attachmentName'
      | 'attachmentKey'
      | 'score'
      | 'feedback'
      | 'filePurged'
      | 'attemptNumber'
    >,
  ) {
    return {
      guid: submission.guid,
      status: submission.status,
      submittedAt: submission.submittedAt,
      fileName: submission.attachmentName,
      fileUrl: this.deliveredFileUrl(submission),
      filePurged: submission.filePurged,
      score: toScore(submission.score),
      feedback: submission.feedback,
      attemptNumber: submission.attemptNumber,
    };
  }

  // ── Examinador ───────────────────────────────────────────────────────────

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
    const text = searchTerm(filter.search);

    const matchFilter: Prisma.SubmissionWhereInput = {
      assignment: { quizConfig: null, module: { courseGuid: filter.course } },
      user: { enrollments: { some: { courseGuid: filter.course, active: true } } },
      status: queueStatusFilter(filter.status),
      ...(text
        ? {
            OR: [
              { user: { firstName: { contains: text } } },
              { user: { lastName: { contains: text } } },
              { assignment: { title: { contains: text } } },
            ],
          }
        : {}),
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
    const text = searchTerm(filter.search);
    const threshold = passingThreshold(course.passingScore);

    const byName = text
      ? Prisma.sql`AND (u.nombre LIKE ${`%${text}%`} OR u.apellido LIKE ${`%${text}%`})`
      : Prisma.empty;

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
      fileUrl: this.deliveredFileUrl(submission),
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

  /**
   * Califica una entrega. Sólo puede hacerlo el responsable del curso.
   *
   * Aprobar marca el recurso como superado y dispara la comprobación de fin de curso.
   * Suspender deja la tarea pendiente para que el alumno pueda reenviarla y le retira el
   * avance que tuviera en ella —por un aprobado anterior o por el desbloqueo por espera—:
   * si no, una tarea suspendida contaría como completada para el certificado.
   *
   * A quien se dio de baja o ya tiene el certificado de esta vuelta no se le califica: la nota
   * movería el avance de una vuelta cerrada.
   */
  async gradeSubmission(submissionGuid: string, dto: GradeSubmissionDto, user: JwtPayload) {
    const { submission, course } = await this.access.managedCourseOfSubmission(submissionGuid, user);

    if (submission.status === 'DRAFT') {
      throw new BadRequestException('Este intento todavía está en curso y no puede calificarse.');
    }

    const threshold = passingThreshold(course.passingScore);
    const score = normalizeScore(dto.score);
    const passed = score >= threshold;
    const feedback = dto.feedback?.trim() || null;

    // Con la matrícula bloqueada: dos calificaciones a la vez se aplican una detrás de otra,
    // y la nota y el avance de la tarea quedan los dos de acuerdo con la última. Por
    // separado, la nota podía ser un suspenso con el avance de un aprobado.
    await this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, submission.userGuid, course.guid), GRADING_CLOSED);

      await tx.submission.update({
        where: { guid: submissionGuid },
        data: { status: 'GRADED', score, feedback },
      });

      if (!submission.assignmentGuid) return;
      if (passed) {
        await recordCompletion(tx, submission.userGuid, submission.assignmentGuid, course.guid);
      } else {
        await tx.resourceProgress.deleteMany({
          where: { userGuid: submission.userGuid, resourceGuid: submission.assignmentGuid },
        });
        await refreshCompletedResources(tx, submission.userGuid, course.guid);
      }
    }, AFTER_LOCK);

    const graded = { submissionGuid, assignmentGuid: submission.assignmentGuid, score, passed };
    this.realtime.emitToUsers('submission:graded', graded, user.country, [submission.userGuid]);
    this.realtime.emitToCourseStaff('submission:graded', graded, user.country, course.teacherGuid);

    emitEvent(this.events, 'submission.graded', {
      submissionGuid,
      userGuid: submission.userGuid,
      country: user.country,
      courseGuid: course.guid,
      assignmentGuid: submission.assignmentGuid,
      assignmentTitle: submission.assignment?.title ?? 'Tarea',
      score,
      passingScore: threshold,
      passed,
      feedback,
    });

    return { guid: submissionGuid, score, passed, passingScore: threshold };
  }

  /**
   * Devuelve **un** intento de cuestionario a un alumno que agotó los suyos sin superarlo.
   *
   * Es la vía de escape del examinador cuando alguien pierde un intento por un problema de
   * conexión o de dispositivo. Se retira únicamente el último intento registrado, porque
   * el recuento se lleva contando entregas: borrarlas todas repondría todos los intentos y
   * se llevaría el historial que el examinador consulta.
   */
  async enableNewAttempt(resourceGuid: string, studentGuid: string, user: JwtPayload) {
    const course = await this.access.managedCourseOfResource(resourceGuid, user);

    const resource = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { title: true, quizConfig: true },
    });
    if (!resource?.quizConfig) {
      throw new BadRequestException('Este recurso no es un cuestionario.');
    }
    const config = parseQuizConfig(resource.quizConfig);

    // Con la matrícula bloqueada, como al abrir y corregir intentos: nadie cuenta a la vez los que quedan.
    await this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, studentGuid, course.guid), NEW_ATTEMPT_CLOSED);
      await this.discardLastAttempt(tx, { resourceGuid, studentGuid, config });
    }, AFTER_LOCK);

    const quizTitle = quizDisplayTitle(resource.title);
    this.logger.log(`${user.email} habilitó un nuevo intento de "${quizTitle}" a ${studentGuid}`);

    // Si tiene el cuestionario abierto, el «has agotado tus intentos» se cambia por el botón
    // de empezar sin que tenga que recargar.
    this.realtime.emitToUsers('quiz:attempt-enabled', { resourceGuid, courseGuid: course.guid }, user.country, [
      studentGuid,
    ]);
    emitEvent(this.events, 'quiz.attempt_enabled', {
      userGuid: studentGuid,
      country: user.country,
      resourceGuid,
      courseGuid: course.guid,
      quizTitle,
    });

    return { message: 'El alumno puede volver a realizar el cuestionario.' };
  }

  /** Retira el último intento calificado; nunca el de quien ya superó el cuestionario ni a quien le quedan. */
  private async discardLastAttempt(
    tx: Prisma.TransactionClient,
    { resourceGuid, studentGuid, config }: { resourceGuid: string; studentGuid: string; config: QuizConfig },
  ): Promise<void> {
    const passed = await tx.resourceProgress.findUnique({
      where: { userGuid_resourceGuid: { userGuid: studentGuid, resourceGuid } },
      select: { id: true },
    });
    if (passed) {
      throw new BadRequestException('Este alumno ya superó el cuestionario: su intento aprobado no se retira.');
    }

    const last = await tx.submission.findFirst({
      where: { assignmentGuid: resourceGuid, userGuid: studentGuid, status: 'GRADED' },
      orderBy: [{ attemptNumber: 'desc' }, { submittedAt: 'desc' }],
      select: { guid: true },
    });
    if (!last) {
      throw new NotFoundException('Este alumno no tiene intentos registrados en el cuestionario.');
    }

    const used = await tx.submission.count({ where: usedAttempts(resourceGuid, studentGuid) });
    if (!attemptsExhausted(config, used)) {
      throw new BadRequestException(
        'A este alumno todavía le quedan intentos: puede volver a presentar el cuestionario sin que le habilites otro.',
      );
    }

    await tx.submission.delete({ where: { guid: last.guid } });
  }
}
