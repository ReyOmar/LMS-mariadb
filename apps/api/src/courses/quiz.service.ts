import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessInfo, CourseAccessService, UNENROLLED_MESSAGE } from './course-access.service';
import { QuizConfig, parseQuizConfig, correctAnswers, withoutAnswers, quizDisplayTitle } from './quiz-config';
import { recordCompletion, refreshCompletedResources } from './resource-progress';
import { AFTER_LOCK, ClosedRoundMessages, assertRoundOpen, lockEnrollment } from '../enrollments/enrollment-lock';
import { isPassing, quizScore, passingThreshold } from '../common/domain/grading';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { emitEvent } from '../common/domain/domain-events';
import { RealtimeService } from '../realtime/realtime.service';

/** Margen de gracia sobre el límite de tiempo, para absorber la latencia del envío. */
const GRACE_PERIOD_MS = 30_000;

/**
 * Tras cuánto deja de considerarse en marcha un intento sin límite de tiempo. No se cierra
 * —el alumno puede retomarlo—, pero ya no cuenta como alguien examinándose ahora mismo.
 */
const UNTIMED_ATTEMPT_WINDOW_MS = 3 * 60 * 60 * 1000;

const ATTEMPTS_CLOSED: ClosedRoundMessages = {
  unenrolled: UNENROLLED_MESSAGE,
  certified: 'Ya terminaste este curso: sus cuestionarios quedaron cerrados con tu certificado.',
};

/**
 * Si un intento abierto sigue en marcha: dentro de su tiempo más la gracia o, sin límite,
 * empezado hace menos de tres horas. Uno abandonado no debe impedir pasar el curso a Borrador.
 */
export function isAttemptLive(startedAt: Date | null, timeLimitMinutes: number, now = Date.now()): boolean {
  if (!startedAt) return false;
  const window = timeLimitMinutes > 0 ? timeLimitMinutes * 60_000 + GRACE_PERIOD_MS : UNTIMED_ATTEMPT_WINDOW_MS;
  return now - startedAt.getTime() <= window;
}

/**
 * Qué cuenta como intento gastado: cualquier entrega que ya no sea el borrador abierto.
 * Es la misma condición al abrir un intento, al calificarlo y al informar de los que
 * quedan, para que la pantalla no prometa intentos que el servidor no va a conceder.
 */
export function usedAttempts(resourceGuid: string, userGuid: string) {
  return { assignmentGuid: resourceGuid, userGuid, status: { not: 'DRAFT' as const } };
}

export function attemptsExhausted(config: QuizConfig, used: number): boolean {
  return config.allowedAttempts > 0 && used >= config.allowedAttempts;
}

function allowedAttemptsLabel(allowed: number): string {
  return allowed === 1 ? 'el único intento disponible' : `los ${allowed} intentos disponibles`;
}

/** Para qué se carga un cuestionario: consultarlo, o abrir y responder sus intentos. */
type QuizUse = 'consult' | 'attempt';

/** Intento abierto tal y como lo recibe el alumno: sin las respuestas correctas. */
function attemptView(attempt: { guid: string; startedAt: Date | null }, config: QuizConfig) {
  return {
    guid: attempt.guid,
    startedAt: attempt.startedAt,
    timeLimitMinutes: config.timeLimitMinutes,
    questions: withoutAnswers(config).questions,
  };
}

/** Estado de un cuestionario para un alumno concreto. */
export interface QuizState {
  attemptsMade: number;
  maxAttempts: number;
  bestScore: number | null;
  passingScore: number;
  passed: boolean;
  attemptInProgress: boolean;
  startedAt: Date | null;
  timeLimitMinutes: number;
  canRetry: boolean;
  blockedReason: string | null;
}

/**
 * Cuestionarios: iniciar un intento, corregirlo y consultar su estado.
 *
 *  - Los intentos **se conservan**, así que el límite configurado se respeta.
 *  - Suspender reinicia el avance en el **material del módulo** (obliga a repasarlo), pero no
 *    borra el historial de intentos ni lo que ya se aprobó.
 */
@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly events: EventEmitter2,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Inicio del intento ───────────────────────────────────────────────────

  /**
   * Abre un intento y devuelve las preguntas **sin las respuestas correctas**.
   *
   * Si ya había un intento abierto se devuelve ese mismo: recargar la página a mitad de un
   * examen no debe consumir un intento ni reiniciar el cronómetro.
   */
  async startAttempt(resourceGuid: string, user: JwtPayload) {
    const { config, course } = await this.loadQuiz(resourceGuid, user, 'attempt');

    return this.prisma.$transaction(async (tx) => {
      // Con la matrícula bloqueada, dos aperturas simultáneas no cuentan los mismos intentos
      // previos ni abren uno por encima del límite, y un suspenso que acaba de devolver al
      // alumno al principio del módulo ya cuenta al decidir si le toca este cuestionario.
      assertRoundOpen(await lockEnrollment(tx, user.sub, course.guid), ATTEMPTS_CLOSED);
      await this.access.ensureUnlocked(course.guid, resourceGuid, user.sub, tx);

      const inProgress = await tx.submission.findFirst({
        where: { assignmentGuid: resourceGuid, userGuid: user.sub, status: 'DRAFT' },
        select: { guid: true, startedAt: true },
      });
      if (inProgress) return attemptView(inProgress, config);

      const alreadyPassed = await tx.resourceProgress.findUnique({
        where: { userGuid_resourceGuid: { userGuid: user.sub, resourceGuid } },
        select: { id: true },
      });
      if (alreadyPassed) {
        throw new BadRequestException('Ya superaste este cuestionario.');
      }

      const previousAttempts = await tx.submission.count({ where: usedAttempts(resourceGuid, user.sub) });
      if (attemptsExhausted(config, previousAttempts)) {
        throw new BadRequestException(
          `Has agotado ${allowedAttemptsLabel(config.allowedAttempts)} para este cuestionario. Contacta con tu examinador.`,
        );
      }

      const attempt = await tx.submission.create({
        data: {
          userGuid: user.sub,
          assignmentGuid: resourceGuid,
          status: 'DRAFT',
          startedAt: new Date(),
          attemptNumber: previousAttempts + 1,
        },
        select: { guid: true, startedAt: true },
      });

      this.logger.log(`Intento ${previousAttempts + 1} iniciado por ${user.sub} en ${course.title}`);
      return attemptView(attempt, config);
    }, AFTER_LOCK);
  }

  // ── Corrección ───────────────────────────────────────────────────────────

  /**
   * Corrige el intento abierto y devuelve la nota sobre 100.
   *
   * La corrección ocurre íntegramente aquí: el navegador nunca ha tenido las respuestas
   * correctas, así que no puede calcular ni falsear la nota.
   *
   * El límite de intentos se vuelve a comprobar: un intento abierto que ya no cabe en él
   * —porque el examinador lo rebajó mientras estaba abierto, por ejemplo— se descarta sin nota.
   */
  async gradeAttempt(resourceGuid: string, user: JwtPayload, answers: Record<string, string>) {
    const { config, course, title, moduleGuid } = await this.loadQuiz(resourceGuid, user, 'attempt');
    const threshold = passingThreshold(course.passingScore);
    const total = config.questions.length;

    const graded = await this.prisma.$transaction(async (tx) => {
      assertRoundOpen(await lockEnrollment(tx, user.sub, course.guid), ATTEMPTS_CLOSED);

      const attempt = await tx.submission.findFirst({
        where: { assignmentGuid: resourceGuid, userGuid: user.sub, status: 'DRAFT' },
        select: { guid: true, startedAt: true },
      });
      if (!attempt) {
        throw new BadRequestException('No tienes ningún intento abierto. Inicia el cuestionario de nuevo.');
      }

      const previousAttempts = await tx.submission.count({ where: usedAttempts(resourceGuid, user.sub) });
      if (attemptsExhausted(config, previousAttempts)) {
        await tx.submission.delete({ where: { guid: attempt.guid } });
        return null;
      }

      const outOfTime = this.timeExceeded(attempt.startedAt, config.timeLimitMinutes);
      const correct = outOfTime ? 0 : this.countCorrect(config, answers);
      const score = quizScore(correct, total);

      // `updateMany` sobre el estado BORRADOR hace la transición atómica: si llegan dos
      // envíos a la vez, sólo uno la consigue y el segundo no crea un intento duplicado.
      const transition = await tx.submission.updateMany({
        where: { guid: attempt.guid, status: 'DRAFT' },
        data: {
          status: 'GRADED',
          submittedAt: new Date(),
          score,
          feedback: outOfTime ? 'Se agotó el tiempo disponible.' : `${correct} de ${total} respuestas correctas.`,
        },
      });
      if (transition.count === 0) {
        throw new BadRequestException('Este intento ya se había enviado.');
      }

      // El avance cambia con la nota y bajo el mismo bloqueo: quien espera su turno —otra
      // apertura, el examinador habilitando un intento— ya encuentra el resultado completo.
      const passed = isPassing(score, threshold);
      if (passed) {
        await recordCompletion(tx, user.sub, resourceGuid, course.guid);
      } else {
        await this.resetModuleProgress(tx, moduleGuid, course.guid, user.sub);
      }
      return { attemptGuid: attempt.guid, outOfTime, correct, score, passed };
    }, AFTER_LOCK);

    if (!graded) {
      throw new BadRequestException(
        `Has agotado ${allowedAttemptsLabel(config.allowedAttempts)} para este cuestionario. Contacta con tu examinador.`,
      );
    }

    const { attemptGuid, outOfTime, correct, score, passed } = graded;

    if (passed) {
      emitEvent(this.events, 'quiz.passed', {
        userGuid: user.sub,
        country: user.country,
        resourceGuid,
        courseGuid: course.guid,
        score,
        quizTitle: title,
      });
    } else {
      emitEvent(this.events, 'quiz.failed', {
        userGuid: user.sub,
        country: user.country,
        resourceGuid,
        score,
        passingScore: threshold,
        quizTitle: title,
        courseGuid: course.guid,
        courseTitle: course.title,
        teacherGuid: course.teacherGuid,
      });
    }

    this.realtime.emitToCourseStaff(
      'submission:graded',
      { submissionGuid: attemptGuid, assignmentGuid: resourceGuid, score, passed },
      user.country,
      course.teacherGuid,
    );

    return { score, passed, correct, total, passingScore: threshold, outOfTime };
  }

  /** Preguntas acertadas. Una pregunta sin responder o con una opción inventada no suma. */
  private countCorrect(config: QuizConfig, answers: Record<string, string>): number {
    let count = 0;
    for (const [questionId, correctOption] of correctAnswers(config)) {
      if (answers[questionId] === correctOption) count++;
    }
    return count;
  }

  private timeExceeded(startedAt: Date | null, limitMinutes: number): boolean {
    if (limitMinutes <= 0 || !startedAt) return false;
    return !isAttemptLive(startedAt, limitMinutes);
  }

  /**
   * Devuelve al alumno al principio del módulo tras suspender: se borra su avance en los
   * recursos de estudio del módulo para que tenga que repasarlos antes de volver a intentarlo.
   *
   * Lo evaluado se conserva. Las tareas que califica el examinador y los cuestionarios ya
   * aprobados son trabajo hecho y corregido: perderlo obligaría a repetir una corrección
   * manual o a superar de nuevo un cuestionario cuyos intentos ya se gastaron.
   */
  private async resetModuleProgress(
    db: Prisma.TransactionClient,
    moduleGuid: string,
    courseGuid: string,
    userGuid: string,
  ): Promise<void> {
    await db.resourceProgress.deleteMany({
      where: { userGuid, resource: { moduleGuid, type: { not: 'ASSIGNMENT' } } },
    });
    await refreshCompletedResources(db, userGuid, courseGuid);
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  /** Estado del cuestionario para el alumno: intentos, mejor nota y si puede reintentar. */
  async getStatus(resourceGuid: string, user: JwtPayload): Promise<QuizState> {
    const { config, course } = await this.loadQuiz(resourceGuid, user, 'consult');
    const threshold = passingThreshold(course.passingScore);

    const [attempts, inProgress, progress] = await Promise.all([
      this.prisma.submission.findMany({
        where: usedAttempts(resourceGuid, user.sub),
        select: { score: true },
      }),
      this.prisma.submission.findFirst({
        where: { assignmentGuid: resourceGuid, userGuid: user.sub, status: 'DRAFT' },
        select: { startedAt: true },
      }),
      this.prisma.resourceProgress.findUnique({
        where: { userGuid_resourceGuid: { userGuid: user.sub, resourceGuid } },
        select: { id: true },
      }),
    ]);

    // Un intento sin corregir cuenta para el límite pero no tiene nota que comparar.
    const scores = attempts.filter((attempt) => attempt.score !== null).map((attempt) => Number(attempt.score));
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;
    const passed = Boolean(progress);
    const limitReached = attemptsExhausted(config, attempts.length);

    return {
      attemptsMade: attempts.length,
      maxAttempts: config.allowedAttempts,
      bestScore,
      passingScore: threshold,
      passed,
      attemptInProgress: Boolean(inProgress),
      startedAt: inProgress?.startedAt ?? null,
      timeLimitMinutes: config.timeLimitMinutes,
      canRetry: !passed && !inProgress && !limitReached,
      blockedReason: this.getBlockedReason(passed, Boolean(inProgress), limitReached, config.allowedAttempts),
    };
  }

  /** Explica al alumno por qué no puede empezar, en lugar de dejar el botón inerte. */
  private getBlockedReason(
    passed: boolean,
    inProgress: boolean,
    limitReached: boolean,
    maxAttempts: number,
  ): string | null {
    if (passed) return 'Ya superaste este cuestionario.';
    if (inProgress) return 'Tienes un intento en curso. Continúalo para poder finalizarlo.';
    if (limitReached) {
      return `Has agotado ${allowedAttemptsLabel(maxAttempts)}. Contacta con tu examinador para que te habilite otro.`;
    }
    return null;
  }

  // ── Común ────────────────────────────────────────────────────────────────

  /**
   * Carga el cuestionario comprobando antes el acceso: sede, matrícula y curso publicado.
   * Abrir y responder intentos es sólo de estudiantes; que el recurso ya esté desbloqueado lo
   * comprueba `startAttempt` con la matrícula bloqueada. Toda entrada al servicio pasa por
   * aquí, así que no hay ningún camino que salte la comprobación.
   */
  private async loadQuiz(resourceGuid: string, user: JwtPayload, use: QuizUse) {
    const course = await this.checkAccess(resourceGuid, user, use);

    const resource = await this.prisma.resource.findUnique({
      where: { guid: resourceGuid },
      select: { quizConfig: true, type: true, title: true, moduleGuid: true },
    });
    if (!resource || resource.type !== 'ASSIGNMENT' || !resource.quizConfig) {
      throw new BadRequestException('Este recurso no es un cuestionario.');
    }

    return {
      config: parseQuizConfig(resource.quizConfig),
      course,
      moduleGuid: resource.moduleGuid,
      // Es el nombre que verá el alumno en su aviso y en su correo.
      title: quizDisplayTitle(resource.title),
    };
  }

  private checkAccess(resourceGuid: string, user: JwtPayload, use: QuizUse): Promise<CourseAccessInfo> {
    return use === 'consult'
      ? this.access.ensureResourceAccess(resourceGuid, user)
      : this.access.studentResourceAccess(resourceGuid, user);
  }
}
