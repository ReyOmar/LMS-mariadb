import { Logger, NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Intento adicional que concede el examinador a quien agotó los del cuestionario.
 *
 * Lo que se defiende aquí es lo que ve el alumno: el aviso nombra el cuestionario como él lo
 * conoce, sin la marca interna con la que se guarda, y la pantalla que tiene abierta se entera
 * al momento de que ya puede volver a presentarlo.
 */

const COURSE = 'curso-1';
const QUIZ = 'cuestionario-1';
const STUDENT = 'alumno-1';
const EXAMINER = sessionFor('TEACHER', 'MEXICO', 'profe-1');

function newAttemptService({ attempts = ['intento-2'] }: { attempts?: string[] } = {}) {
  const remaining = [...attempts];
  const prisma = {
    resource: {
      findUnique: async () => ({ title: '[QUIZ] Evaluación del módulo 1', quizConfig: '{}' }),
    },
    submission: {
      findFirst: async () => (remaining.length > 0 ? { guid: remaining[0] } : null),
      delete: jest.fn(async ({ where }: { where: { guid: string } }) => {
        remaining.splice(remaining.indexOf(where.guid), 1);
      }),
    },
    resourceProgress: { deleteMany: async () => ({ count: 0 }) },
    $executeRaw: async () => 1,
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
  return { service, prisma, realtime, events, remaining };
}

describe('intento adicional de un cuestionario', () => {
  // La traza de quién concedió el intento no es lo que se prueba aquí.
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('retira sólo el último intento', async () => {
    const { service, remaining } = newAttemptService({ attempts: ['intento-2', 'intento-1'] });

    await service.enableNewAttempt(QUIZ, STUDENT, EXAMINER);

    expect(remaining).toEqual(['intento-1']);
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

  it('sin intentos registrados no hay nada que devolver ni que avisar', async () => {
    const { service, prisma, realtime, events } = newAttemptService({ attempts: [] });

    await expect(service.enableNewAttempt(QUIZ, STUDENT, EXAMINER)).rejects.toThrow(NotFoundException);
    expect(prisma.submission.delete).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
