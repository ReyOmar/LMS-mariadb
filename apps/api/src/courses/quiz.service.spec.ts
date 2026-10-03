import { QuizService, isAttemptLive } from './quiz.service';
import { serializeQuizConfig } from './quiz-config';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Intentos de cuestionario.
 *
 * Lo que se comprueba aquí es el límite de intentos: dos aperturas a la vez no pueden
 * saltárselo, y un intento abierto que ya no cabe en él no se califica.
 */

const STUDENT = sessionFor('STUDENT', 'COLOMBIA', 'alumna');
const COURSE = { guid: 'curso-1', title: 'Curso', passingScore: 80, teacherGuid: 'profe' };
const CONFIG = serializeQuizConfig({
  allowedAttempts: 2,
  timeLimitMinutes: 0,
  questions: [
    {
      id: 'p1',
      prompt: '¿Velocidad máxima en zona escolar?',
      options: [
        { id: 'a', text: '30 km/h', isCorrect: true },
        { id: 'b', text: '60 km/h', isCorrect: false },
      ],
    },
  ],
});

/** Servicio con una base en memoria que registra, en orden, lo que se hace dentro de la transacción. */
function quizService(state: { used: number; draft: { guid: string; startedAt: Date } | null }) {
  const steps: string[] = [];
  const transactionOptions: unknown[] = [];
  const tx = {
    $queryRaw: async () => {
      steps.push('bloqueo');
      return [];
    },
    submission: {
      findFirst: async () => state.draft,
      count: async () => {
        steps.push('recuento');
        return state.used;
      },
      create: async () => ({ guid: 'nuevo', startedAt: new Date() }),
      delete: async () => {
        steps.push('descarte');
        state.draft = null;
      },
      updateMany: async () => ({ count: 1 }),
    },
    resourceProgress: { findUnique: async () => null },
  };
  const prisma = {
    resource: {
      findUnique: async () => ({ quizConfig: CONFIG, type: 'ASSIGNMENT', title: '[QUIZ] Repaso', moduleGuid: 'm1' }),
    },
    $transaction: async (work: (client: typeof tx) => Promise<unknown>, options: unknown) => {
      transactionOptions.push(options);
      return work(tx);
    },
  };
  const access = {
    studentResourceAccess: async () => COURSE,
    unlockedResourceAccess: async () => COURSE,
  };
  const service = new QuizService(prisma as never, access as never, { emit: () => true } as never, {} as never);
  return { service, steps, transactionOptions };
}

describe('QuizService · límite de intentos', () => {
  it('bloquea la matrícula antes de contar los intentos al abrir uno', async () => {
    const { service, steps, transactionOptions } = quizService({ used: 1, draft: null });

    await service.startAttempt('quiz-1', STUDENT);

    // Con el bloqueo primero, una segunda apertura simultánea espera y ve el intento ya creado.
    expect(steps).toEqual(['bloqueo', 'recuento']);
    expect(transactionOptions).toEqual([{ isolationLevel: 'ReadCommitted' }]);
  });

  it('no abre un intento por encima del límite', async () => {
    const { service } = quizService({ used: 2, draft: null });

    await expect(service.startAttempt('quiz-1', STUDENT)).rejects.toThrow(/Has agotado los 2 intentos disponibles/);
  });

  it('descarta sin calificar un intento abierto que ya no cabe en el límite', async () => {
    const state = { used: 2, draft: { guid: 'sobrante', startedAt: new Date() } };
    const { service, steps } = quizService(state);

    await expect(service.gradeAttempt('quiz-1', STUDENT, { p1: 'a' })).rejects.toThrow(/Has agotado/);
    expect(steps).toEqual(['bloqueo', 'recuento', 'descarte']);
    expect(state.draft).toBeNull();
  });
});

describe('isAttemptLive', () => {
  const now = Date.UTC(2026, 5, 10, 12);
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);

  it('un intento cronometrado sigue en marcha hasta agotar su tiempo y la gracia', () => {
    expect(isAttemptLive(minutesAgo(30), 30, now)).toBe(true);
    expect(isAttemptLive(minutesAgo(31), 30, now)).toBe(false);
  });

  it('uno sin límite se da por abandonado a las tres horas', () => {
    expect(isAttemptLive(minutesAgo(179), 0, now)).toBe(true);
    expect(isAttemptLive(minutesAgo(181), 0, now)).toBe(false);
  });

  it('sin fecha de inicio no está en marcha', () => {
    expect(isAttemptLive(null, 30, now)).toBe(false);
  });
});
