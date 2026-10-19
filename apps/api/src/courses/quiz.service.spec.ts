import { QuizService, isAttemptLive } from './quiz.service';
import { serializeQuizConfig } from './quiz-config';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Intentos de cuestionario.
 *
 * Lo que se comprueba aquí es el límite de intentos —dos aperturas a la vez no pueden
 * saltárselo, y un intento abierto que ya no cabe en él no se califica—, que una vuelta
 * dada de baja o ya certificada no admite intentos nuevos y que el avance cambia con la nota,
 * bajo el mismo bloqueo de la matrícula.
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

interface QuizState {
  used: number;
  draft: { guid: string; startedAt: Date } | null;
  round?: { active: boolean; completedAt: Date | null };
}

/** Servicio con una base en memoria que registra, en orden, lo que se hace dentro de la transacción. */
function quizService(state: QuizState) {
  const steps: string[] = [];
  const transactionOptions: unknown[] = [];
  const round = state.round ?? { active: true, completedAt: null };
  const tx = {
    $queryRaw: async () => {
      steps.push('bloqueo');
      return [{ active: round.active ? 1 : 0, completedAt: round.completedAt }];
    },
    submission: {
      findFirst: async () => state.draft,
      count: async () => {
        steps.push('recuento');
        return state.used;
      },
      create: jest.fn(async () => ({ guid: 'nuevo', startedAt: new Date() })),
      delete: async () => {
        steps.push('descarte');
        state.draft = null;
      },
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    resourceProgress: {
      findUnique: async () => null,
      upsert: jest.fn(async () => {
        steps.push('aprobado');
      }),
      deleteMany: jest.fn(async () => {
        steps.push('reinicio del módulo');
        return { count: 1 };
      }),
    },
    $executeRaw: async () => 1,
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
    ensureUnlocked: jest.fn(async () => {
      steps.push('desbloqueo');
    }),
  };
  const realtime = { emitToCourseStaff: () => undefined };
  const service = new QuizService(prisma as never, access as never, { emit: () => true } as never, realtime as never);
  return { service, steps, transactionOptions, tx, access };
}

describe('QuizService · límite de intentos', () => {
  it('bloquea la matrícula antes de contar los intentos al abrir uno', async () => {
    const { service, steps, transactionOptions } = quizService({ used: 1, draft: null });

    await service.startAttempt('quiz-1', STUDENT);

    // Con el bloqueo primero, una segunda apertura simultánea espera y ve el intento ya creado.
    expect(steps).toEqual(['bloqueo', 'desbloqueo', 'recuento']);
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

describe('QuizService · avance', () => {
  it('comprueba el desbloqueo con la matrícula ya bloqueada: un suspenso recién confirmado cuenta', async () => {
    const { service, access, tx } = quizService({ used: 0, draft: null });

    await service.startAttempt('quiz-1', STUDENT);

    expect(access.ensureUnlocked).toHaveBeenCalledWith('curso-1', 'quiz-1', 'alumna', tx);
  });

  it('aprobar lo deja superado dentro de la transacción de la nota', async () => {
    const { service, steps } = quizService({ used: 0, draft: { guid: 'abierto', startedAt: new Date() } });

    const result = await service.gradeAttempt('quiz-1', STUDENT, { p1: 'a' });

    expect(result.passed).toBe(true);
    expect(steps).toEqual(['bloqueo', 'recuento', 'aprobado']);
  });

  it('suspender reinicia sólo el material del módulo, dentro de la transacción de la nota', async () => {
    const { service, steps, tx } = quizService({ used: 0, draft: { guid: 'abierto', startedAt: new Date() } });

    const result = await service.gradeAttempt('quiz-1', STUDENT, { p1: 'b' });

    expect(result.passed).toBe(false);
    expect(steps).toEqual(['bloqueo', 'recuento', 'reinicio del módulo']);
    // Ni las tareas calificadas ni los cuestionarios ya aprobados: sólo el material de estudio.
    expect(tx.resourceProgress.deleteMany).toHaveBeenCalledWith({
      where: { userGuid: 'alumna', resource: { moduleGuid: 'm1', type: { not: 'ASSIGNMENT' } } },
    });
  });
});

describe('QuizService · vuelta cerrada', () => {
  const CERTIFIED = { active: true, completedAt: new Date('2026-02-20') };
  const UNENROLLED = { active: false, completedAt: null };

  it('con la vuelta certificada no abre un intento nuevo', async () => {
    const { service, tx } = quizService({ used: 0, draft: null, round: CERTIFIED });

    await expect(service.startAttempt('quiz-1', STUDENT)).rejects.toThrow(
      'Ya terminaste este curso: sus cuestionarios quedaron cerrados con tu certificado.',
    );
    expect(tx.submission.create).not.toHaveBeenCalled();
  });

  it('con la vuelta certificada no califica un intento que quedó abierto', async () => {
    const { service, tx } = quizService({
      used: 0,
      draft: { guid: 'abierto', startedAt: new Date() },
      round: CERTIFIED,
    });

    await expect(service.gradeAttempt('quiz-1', STUDENT, { p1: 'a' })).rejects.toThrow(/quedaron cerrados/);
    expect(tx.submission.updateMany).not.toHaveBeenCalled();
  });

  it('dado de baja no abre ni califica intentos', async () => {
    const { service, tx } = quizService({
      used: 0,
      draft: { guid: 'abierto', startedAt: new Date() },
      round: UNENROLLED,
    });

    await expect(service.startAttempt('quiz-1', STUDENT)).rejects.toThrow(/dada de baja/);
    await expect(service.gradeAttempt('quiz-1', STUDENT, { p1: 'a' })).rejects.toThrow(/dada de baja/);
    expect(tx.submission.updateMany).not.toHaveBeenCalled();
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
