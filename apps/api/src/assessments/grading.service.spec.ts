import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { sessionFor } from '../common/testing/test-campus';
import { GradingService } from './grading.service';

const COURSE = 'curso-1';
const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin-1');

/** Un fragmento `Prisma.sql`: el recálculo del avance llega a la base como uno de ellos. */
function isFragment(value: unknown): value is { sql: string; values: unknown[] } {
  return typeof value === 'object' && value !== null && 'sql' in value && 'values' in value;
}

/**
 * Calificar una tarea.
 *
 * Una tarea cuenta como completada para el certificado cuando tiene avance registrado. Ese
 * avance llega al aprobar, pero también por el desbloqueo tras 48 h de espera; si al
 * suspender no se retirara, la tarea suspendida seguiría contando como hecha y el alumno
 * podría certificarse sin aprobarla.
 */
describe('calificación de una tarea', () => {
  /** La versión de la entrega que tiene delante el examinador. */
  const REVIEWED = '2026-03-02T10:15:00.000Z';

  function gradingService({
    enrolled = true,
    certifiedAt = null as Date | null,
    quizConfig = null as string | null,
    storedVersion = REVIEWED,
  } = {}) {
    const progress = new Set<string>(['alumno-1|tarea-1']);
    const recounts: unknown[][] = [];
    const steps: string[] = [];
    const transactionOptions: unknown[] = [];
    const prisma = {
      // El bloqueo de la matrícula, que devuelve si sigue activa y si su vuelta terminó.
      $queryRaw: async () => {
        steps.push('bloqueo');
        return [{ active: enrolled ? 1 : 0, completedAt: certifiedAt }];
      },
      $transaction: async (work: (client: never) => Promise<unknown>, options: unknown) => {
        transactionOptions.push(options);
        return work(prisma as never);
      },
      submission: {
        updateMany: jest.fn(async ({ where }: { where: { submittedAt: Date } }) => {
          steps.push('nota');
          return { count: where.submittedAt.toISOString() === storedVersion ? 1 : 0 };
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
          assignment: { title: 'Informe de ruta', quizConfig, module: { courseGuid: COURSE } },
        },
        course: { guid: COURSE, title: 'Manejo defensivo', passingScore: 80 },
      }),
    };
    const realtime = { emitToUsers: () => undefined, emitToCourseStaff: () => undefined };
    const events = { emit: () => true };

    const service = new GradingService(prisma as never, access as never, realtime as never, events as never);
    return { service, progress, recounts, prisma, steps, transactionOptions };
  }

  it('un intento de cuestionario no se califica a mano: ni la nota ni el avance cambian', async () => {
    const { service, progress, steps } = gradingService({ quizConfig: '{"questions":[]}' });

    await expect(service.gradeSubmission('entrega-1', { score: 10, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      BadRequestException,
    );

    expect(steps).toEqual([]);
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });

  it('si el alumno envió otra versión mientras se revisaba, no guarda la nota ni toca el avance', async () => {
    const { service, progress, steps } = gradingService({ storedVersion: '2026-03-02T10:40:00.000Z' });

    await expect(service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      ConflictException,
    );
    expect(steps).toEqual(['bloqueo', 'nota']);
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });

  it('aprobar deja la tarea completada', async () => {
    const { service, progress } = gradingService();

    const result = await service.gradeSubmission('entrega-1', { score: 90, submittedAt: REVIEWED }, ADMIN);

    expect(result.passed).toBe(true);
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });

  it('suspender retira el avance que tuviera la tarea, aunque viniera del desbloqueo por espera', async () => {
    const { service, progress } = gradingService();

    const result = await service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN);

    expect(result.passed).toBe(false);
    expect(progress.has('alumno-1|tarea-1')).toBe(false);
  });

  it('aprobando o suspendiendo, recalcula el avance guardado en la matrícula del alumno', async () => {
    for (const score of [90, 40]) {
      const { service, recounts } = gradingService();

      await service.gradeSubmission('entrega-1', { score, submittedAt: REVIEWED }, ADMIN);

      expect(recounts).toEqual([['alumno-1', COURSE]]);
    }
  });

  it('dos calificaciones a la vez van en fila: nota y avance se escriben con la matrícula bloqueada', async () => {
    for (const score of [90, 40]) {
      const { service, steps, transactionOptions } = gradingService();

      await service.gradeSubmission('entrega-1', { score, submittedAt: REVIEWED }, ADMIN);

      // Si la nota y el avance se escribieran fuera, un suspenso podía quedar con el avance
      // de un aprobado que se calificó a la vez.
      expect(steps).toEqual(['bloqueo', 'nota', 'avance']);
      expect(transactionOptions).toEqual([{ isolationLevel: 'ReadCommitted' }]);
    }
  });

  it('no califica la entrega de quien se dio de baja del curso', async () => {
    const { service, prisma, progress } = gradingService({ enrolled: false });

    await expect(service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      /ya no está matriculado/,
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
  });

  it('no recalifica una entrega de una vuelta ya certificada: su nota respalda el certificado', async () => {
    const { service, prisma, progress, recounts } = gradingService({ certifiedAt: new Date('2026-02-20') });

    await expect(service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.gradeSubmission('entrega-1', { score: 40, submittedAt: REVIEWED }, ADMIN)).rejects.toThrow(
      'La vuelta de este alumno ya está certificada: su calificación no puede cambiarse.',
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(progress.has('alumno-1|tarea-1')).toBe(true);
    expect(recounts).toEqual([]);
  });
});
