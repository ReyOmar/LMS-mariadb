import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { serializeQuizConfig } from '../courses/quiz-config';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Intento adicional que concede el examinador a quien agotó los del cuestionario.
 *
 * Lo que se defiende aquí es lo que ve el alumno —el aviso nombra el cuestionario como él lo
 * conoce y la pantalla que tiene abierta se entera al momento— y lo que no se puede perder: un
 * intento aprobado, una nota de quien aún tenía intentos y el registro de una vuelta certificada.
 */

const COURSE = 'curso-1';
const QUIZ = 'cuestionario-1';
const STUDENT = 'alumno-1';
const EXAMINER = sessionFor('TEACHER', 'MEXICO', 'profe-1');
const QUESTION = {
  id: 'p1',
  prompt: '¿Distancia de seguridad en autopista?',
  options: [
    { id: 'a', text: 'Dos segundos', isCorrect: true },
    { id: 'b', text: 'Un metro', isCorrect: false },
  ],
};

interface Scenario {
  /** Intentos calificados, del más reciente al más antiguo. */
  attempts?: string[];
  allowedAttempts?: number;
  passed?: boolean;
  round?: { active: boolean; completedAt: Date | null };
}

function newAttemptService({
  attempts = ['intento-2', 'intento-1'],
  allowedAttempts = 2,
  passed = false,
  round = { active: true, completedAt: null },
}: Scenario = {}) {
  const remaining = [...attempts];
  const steps: string[] = [];
  const transactionOptions: unknown[] = [];
  const prisma = {
    resource: {
      findUnique: async () => ({
        title: '[QUIZ] Evaluación del módulo 1',
        quizConfig: serializeQuizConfig({ allowedAttempts, timeLimitMinutes: 0, questions: [QUESTION] }),
      }),
    },
    $queryRaw: async () => {
      steps.push('bloqueo');
      return [{ active: round.active ? 1 : 0, completedAt: round.completedAt }];
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>, options: unknown) => {
      transactionOptions.push(options);
      return work(prisma);
    },
    resourceProgress: { findUnique: async () => (passed ? { id: 1 } : null) },
    submission: {
      findFirst: async () => (remaining.length > 0 ? { guid: remaining[0] } : null),
      count: async () => remaining.length,
      delete: jest.fn(async ({ where }: { where: { guid: string } }) => {
        steps.push('retirar intento');
        remaining.splice(remaining.indexOf(where.guid), 1);
      }),
    },
  };
  const access = {
    managedCourseOfResource: async () => ({ guid: COURSE, title: 'Manejo defensivo', teacherGuid: 'profe-1' }),
  };
  const realtime = { emitToUsers: jest.fn(), emitToCourseStaff: jest.fn() };
  const events = { emit: jest.fn() };

  const service = new AssessmentsService(
    prisma as never,
    {} as never,
    access as never,
    {} as never,
    realtime as never,
    events as never,
    {} as never,
  );
  return { service, prisma, realtime, events, remaining, steps, transactionOptions };
}

describe('intento adicional de un cuestionario', () => {
  // La traza de quién concedió el intento no es lo que se prueba aquí.
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('retira sólo el último intento, con la matrícula bloqueada', async () => {
    const { service, remaining, steps, transactionOptions } = newAttemptService();

    await service.enableNewAttempt(QUIZ, STUDENT, EXAMINER);

    expect(remaining).toEqual(['intento-1']);
    expect(steps).toEqual(['bloqueo', 'retirar intento']);
    expect(transactionOptions).toEqual([{ isolationLevel: 'ReadCommitted' }]);
  });

  it('el aviso al alumno nombra el cuestionario sin la marca interna', async () => {
    const { service, events } = newAttemptService();

    await service.enableNewAttempt(QUIZ, STUDENT, EXAMINER);

    expect(events.emit).toHaveBeenCalledWith(
      'quiz.attempt_enabled',
      expect.objectContaining({ userGuid: STUDENT, quizTitle: 'Evaluación del módulo 1' }),
    );
  });

  it('avisa al momento a la pantalla del alumno, y sólo a él y en su sede', async () => {
    const { service, realtime } = newAttemptService();

    await service.enableNewAttempt(QUIZ, STUDENT, EXAMINER);

    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      'quiz:attempt-enabled',
      { resourceGuid: QUIZ, courseGuid: COURSE },
      'MEXICO',
      [STUDENT],
    );
  });

  it.each<[string, Scenario, new (...args: never[]) => Error, RegExp]>([
    ['sin intentos registrados', { attempts: [] }, NotFoundException, /no tiene intentos/],
    ['a quien ya lo superó: su intento aprobado no se retira', { passed: true }, BadRequestException, /ya superó/],
    ['a quien aún le quedan intentos', { allowedAttempts: 3 }, BadRequestException, /todavía le quedan intentos/],
    ['con intentos ilimitados', { allowedAttempts: 0 }, BadRequestException, /todavía le quedan intentos/],
    [
      'a quien se dio de baja',
      { round: { active: false, completedAt: null } },
      ForbiddenException,
      /ya no está matriculado/,
    ],
    [
      'en una vuelta ya certificada',
      { round: { active: true, completedAt: new Date() } },
      ForbiddenException,
      /ya está certificada/,
    ],
  ])('no retira nada ni avisa %s', async (_, scenario, error, message) => {
    const { service, prisma, realtime, events } = newAttemptService(scenario);

    const attempt = service.enableNewAttempt(QUIZ, STUDENT, EXAMINER);

    await expect(attempt).rejects.toThrow(error);
    await expect(attempt).rejects.toThrow(message);
    expect(prisma.submission.delete).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
