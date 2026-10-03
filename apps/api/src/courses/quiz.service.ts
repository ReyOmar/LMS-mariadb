import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessInfo, CourseAccessService } from './course-access.service';
import { QuizConfig, parseQuizConfig, correctAnswers, withoutAnswers } from './quiz-config';
import { recordCompletion, refreshCompletedResources } from './resource-progress';
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
function usedAttempts(resourceGuid: string, userGuid: string) {
  return { assignmentGuid: resourceGuid, userGuid, status: { not: 'DRAFT' as const } };
}

function attemptsExhausted(config: QuizConfig, used: number): boolean {
  return config.allowedAttempts > 0 && used >= config.allowedAttempts;
}

function allowedAttemptsLabel(allowed: number): string {
  return allowed === 1 ? 'el único intento disponible' : `los ${allowed} intentos disponibles`;
}

/**
 * Pone en fila las operaciones de un alumno sobre los cuestionarios de un curso: bloquea su
 * matrícula hasta que termina la transacción. Sin ello, dos aperturas simultáneas contarían
 * los mismos intentos previos y abrirían uno por encima del límite.
 */
async function lockEnrollment(tx: Prisma.TransactionClient, userGuid: string, courseGuid: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM lms_matriculas WHERE usuario_guid = ${userGuid} AND curso_guid = ${courseGuid} FOR UPDATE`;
}

/** Tras el bloqueo, cada lectura ve lo último confirmado y no la foto del inicio de la transacción. */
const AFTER_LOCK = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

/** Para qué se carga un cuestionario: consultarlo, responder el intento abierto o abrir uno. */
type QuizUse = 'consult' | 'answer' | 'start';

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
 *  - Suspender reinicia el **progreso del módulo** (obliga a repasar el material), pero no
 *    borra el historial de intentos.
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
    const { config, course } = await this.loadQuiz(resourceGuid, user, 'start');

    return this.prisma.$transaction(async (tx) => {
      await lockEnrollment(tx, user.sub, course.guid);

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
    const { config, course, title, moduleGuid } = await this.loadQuiz(resourceGuid, user, 'answer');
    const threshold = passingThreshold(course.passingScore);
    const total = config.questions.length;

    const graded = await this.prisma.$transaction(async (tx) => {
      await lockEnrollment(tx, user.sub, course.guid);

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
      return { attemptGuid: attempt.guid, outOfTime, correct, score };
    }, AFTER_LOCK);

    if (!graded) {
      throw new BadRequestException(
        `Has agotado ${allowedAttemptsLabel(config.allowedAttempts)} para este cuestionario. Contacta con tu examinador.`,
      );
    }

    const { attemptGuid, outOfTime, correct, score } = graded;
    const passed = isPassing(score, threshold);

    if (passed) {
      await recordCompletion(this.prisma, user.sub, resourceGuid, course.guid);
      emitEvent(this.events, 'quiz.passed', {
        userGuid: user.sub,
        country: user.country,
        resourceGuid,
        courseGuid: course.guid,
        score,
        quizTitle: title,
      });
    } else {
      await this.resetModuleProgress(moduleGuid, course.guid, user.sub);
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
   * Devuelve al alumno al principio del módulo tras suspender: se borra el progreso de los
   * recursos de estudio y de los cuestionarios del módulo para que tenga que repasarlos
   * antes de volver a intentarlo.
   *
   * No se tocan las tareas que califica el examinador: su calificación es trabajo ya hecho
   * y corregido, y perderla obligaría a repetir una corrección manual.
   */
  private async resetModuleProgress(moduleGuid: string, courseGuid: string, userGuid: string): Promise<void> {
    await this.prisma.resourceProgress.deleteMany({
      where: {
        userGuid,
        resource: { moduleGuid, OR: [{ type: { not: 'ASSIGNMENT' } }, { quizConfig: { not: null } }] },
      },
    });
    await refreshCompletedResources(this.prisma, userGuid, courseGuid);
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
   * Responderlo es sólo de estudiantes, y abrir un intento exige además que el recurso ya
   * esté desbloqueado si el curso tiene orden estricto. Toda entrada al servicio pasa por
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
      // Sin la marca interna: es el nombre que verá el alumno en su aviso y en su correo.
      title: resource.title.replace(/^\[QUIZ\]\s*/, ''),
    };
  }

  private checkAccess(resourceGuid: string, user: JwtPayload, use: QuizUse): Promise<CourseAccessInfo> {
    switch (use) {
      case 'consult':
        return this.access.ensureResourceAccess(resourceGuid, user);
      case 'answer':
        return this.access.studentResourceAccess(resourceGuid, user);
      case 'start':
        return this.access.unlockedResourceAccess(resourceGuid, user);
    }
  }
}
