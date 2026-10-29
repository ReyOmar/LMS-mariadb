import { BadRequestException } from '@nestjs/common';
import { sessionFor } from '../common/testing/test-campus';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';
import { MIB, UploadLimit } from '../storage/upload-limits';
import { SubmissionsService } from './submissions.service';

const COURSE = 'curso-1';

/**
 * Límite de la entrega de una tarea.
 *
 * El dueño del campus fija cada tarea con su propio límite —1 GB en una, 10 MB en otra—, y
 * sin límite propio rige el general de la sede. Aquí se fija que el archivo se reciba con
 * ese límite exacto y que nada se lea antes de saber que la entrega procede.
 */
describe('entrega de una tarea: límite de subida', () => {
  const STUDENT = sessionFor('STUDENT', 'COLOMBIA', 'alumno-1');

  interface Previous {
    guid: string;
    status: string;
    score: number | null;
    attachmentKey: string | null;
    attachmentName?: string;
    filePurged?: boolean;
  }

  interface Round {
    active: boolean;
    completedAt: Date | null;
  }

  function submissionService({
    ownLimitMb = null,
    previous = null,
    failOnSave = false,
    round = { active: true, completedAt: null },
    roundAtLock = round,
    lockedAtLock = false,
  }: {
    ownLimitMb?: number | null;
    previous?: Previous | null;
    failOnSave?: boolean;
    /** La matrícula al pedir la entrega. */
    round?: Round;
    /** La matrícula cuando el archivo ya llegó y se bloquea para guardarlo. */
    roundAtLock?: Round;
    /** Con la matrícula ya bloqueada, la tarea volvió a quedar bloqueada por el orden del curso. */
    lockedAtLock?: boolean;
  } = {}) {
    // La entrega guardada del alumno: lo que confirma un envío lo ve el siguiente.
    let stored: Record<string, unknown> | null = previous && { ...previous };
    const writes: string[] = [];
    const save =
      (operation: string) =>
      async ({ data }: { data: Record<string, unknown> }) => {
        if (failOnSave) throw new Error('base de datos caída');
        writes.push(operation);
        stored = {
          guid: 'entrega-1',
          score: null,
          feedback: null,
          filePurged: false,
          attemptNumber: 1,
          ...stored,
          ...data,
        };
        return stored;
      };

    // El bloqueo de la matrícula: las transacciones corren de una en una, como con FOR UPDATE.
    let queue: Promise<unknown> = Promise.resolve();
    const prisma = {
      resource: {
        findUnique: async () => ({ title: 'Informe', type: 'ASSIGNMENT', quizConfig: null, maxUploadMb: ownLimitMb }),
      },
      submission: { findFirst: async () => stored, create: save('alta'), update: save('sustitución') },
      enrollment: { findUnique: async () => round },
      $queryRaw: async () => [{ active: roundAtLock.active ? 1 : 0, completedAt: roundAtLock.completedAt }],
      $transaction: (work: (client: never) => Promise<unknown>) => {
        const run = queue.then(() => work(prisma as never));
        queue = run.catch(() => undefined);
        return run;
      },
    };

    const uploads: { folder: string; uploader: unknown; maxBytes?: number }[] = [];
    const storage = {
      uploadFromDisk: async (_path: string, _name: string, folder: string, uploader: unknown, maxBytes?: number) => {
        uploads.push({ folder, uploader, maxBytes });
        return 'entregas/nueva.pdf';
      },
      downloadUrl: jest.fn(() => '/api/storage/download/entregas/nueva.pdf?exp=1&sig=x'),
    };
    const files = fileOwnershipDouble();
    const course = { guid: COURSE, title: 'Manejo defensivo', passingScore: 80, teacherGuid: 'profe-1' };
    const access = {
      unlockedResourceAccess: async () => course,
      ensureResourceAccess: async () => course,
      ensureUnlocked: async () => {
        if (lockedAtLock) throw new BadRequestException('Este recurso aún está bloqueado.');
      },
    };
    const settings = { getMaxUploadMb: async () => 10 };
    const received: { isResubmission: boolean }[] = [];
    const events = {
      emit: (_name: string, event: { isResubmission: boolean }) => received.push(event),
    };

    const service = new SubmissionsService(
      prisma as never,
      storage as never,
      access as never,
      settings as never,
      events as never,
      files.files,
    );
    const receive = jest.fn(async (_limit: UploadLimit) => ({ name: 'informe.pdf', filePath: '/tmp/subida' }));

    return { service, receive, uploads, storage, files, writes, received, stored: () => stored };
  }

  it('dos envíos a la vez de la misma tarea acaban en una sola entrega', async () => {
    const { service, receive, writes } = submissionService();

    // Un doble clic: los dos pasan la comprobación previa antes de que ninguno guarde.
    await Promise.all([
      service.recordSubmission('tarea-1', receive, STUDENT),
      service.recordSubmission('tarea-1', receive, STUDENT),
    ]);

    expect(writes).toEqual(['alta', 'sustitución']);
  });

  it('sustituir un reenvío que aún no se ha calificado lo deja como reenvío', async () => {
    const { service, receive, received, stored } = submissionService({
      previous: { guid: 'entrega-0', status: 'IN_REVIEW', score: 40, attachmentKey: 'entregas/corregida.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(stored()?.status).toBe('IN_REVIEW');
    expect(received).toEqual([expect.objectContaining({ isResubmission: true, previousScore: 40 })]);
  });

  it('sustituir una entrega sin calificar no la convierte en reenvío', async () => {
    const { service, receive, received, stored } = submissionService({
      previous: { guid: 'entrega-0', status: 'SUBMITTED', score: null, attachmentKey: 'entregas/primera.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(stored()?.status).toBe('SUBMITTED');
    expect(received).toEqual([expect.objectContaining({ isResubmission: false })]);
  });

  it('recibe el archivo con el límite propio de la tarea, aunque supere el general de la sede', async () => {
    const { service, receive, uploads } = submissionService({ ownLimitMb: 1024 });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: 1024 * MIB, message: 'El archivo supera el límite de 1 GB de esta tarea.' }),
    );
    expect(uploads).toEqual([{ folder: 'entregas', uploader: STUDENT, maxBytes: 1024 * MIB }]);
  });

  it('sin límite propio aplica el general de la sede', async () => {
    const { service, receive, uploads } = submissionService();

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: 10 * MIB, message: 'El archivo supera el límite de 10 MB de esta tarea.' }),
    );
    expect(uploads).toEqual([{ folder: 'entregas', uploader: STUDENT, maxBytes: 10 * MIB }]);
  });

  it('no lee el archivo de una entrega que ya está aprobada', async () => {
    const { service, receive } = submissionService({
      previous: { guid: 'entrega-0', status: 'GRADED', score: 90, attachmentKey: 'entregas/vieja.pdf' },
    });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(/ya fue aprobada/);
    expect(receive).not.toHaveBeenCalled();
  });

  it('retira el archivo guardado si no se puede registrar la entrega', async () => {
    const { service, receive, files } = submissionService({ failOnSave: true });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow('base de datos caída');
    expect(files.discarded).toHaveBeenCalledWith(['entregas/nueva.pdf']);
  });

  it('al reenviar retira el archivo anterior sólo si ya no lo usa nadie', async () => {
    const { service, receive, files } = submissionService({
      previous: { guid: 'entrega-0', status: 'GRADED', score: 40, attachmentKey: 'entregas/vieja.pdf' },
    });

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(files.retired()).toEqual(['entregas/vieja.pdf']);
  });

  it('el enlace de descarga lleva el nombre original del archivo', async () => {
    const { service, receive, storage } = submissionService();

    await service.recordSubmission('tarea-1', receive, STUDENT);

    expect(storage.downloadUrl).toHaveBeenCalledWith('entregas/nueva.pdf', 'informe.pdf');
  });

  it('con la vuelta certificada no recibe el archivo: sus entregas quedaron cerradas', async () => {
    const { service, receive, uploads } = submissionService({ round: { active: true, completedAt: new Date() } });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(
      'Ya terminaste este curso: tus entregas quedaron cerradas con tu certificado.',
    );
    expect(receive).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
  });

  it('dado de baja tampoco recibe el archivo', async () => {
    const { service, receive } = submissionService({ round: { active: false, completedAt: null } });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(/dada de baja/);
    expect(receive).not.toHaveBeenCalled();
  });

  it('si la vuelta se certifica mientras sube el archivo, no guarda la entrega y retira lo subido', async () => {
    const { service, receive, files, writes } = submissionService({
      roundAtLock: { active: true, completedAt: new Date() },
    });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(/entregas quedaron cerradas/);
    expect(writes).toEqual([]);
    expect(files.discarded).toHaveBeenCalledWith(['entregas/nueva.pdf']);
  });

  it('si un suspenso vuelve a bloquear la tarea mientras sube el archivo, no guarda la entrega y retira lo subido', async () => {
    const { service, receive, files, writes } = submissionService({ lockedAtLock: true });

    await expect(service.recordSubmission('tarea-1', receive, STUDENT)).rejects.toThrow(/bloqueado/);
    expect(writes).toEqual([]);
    expect(files.discarded).toHaveBeenCalledWith(['entregas/nueva.pdf']);
  });

  it('una entrega cuyo archivo se retiró se le muestra con su nombre y sin enlace de descarga', async () => {
    const { service, storage } = submissionService({
      previous: {
        guid: 'entrega-0',
        status: 'GRADED',
        score: 90,
        attachmentKey: 'entregas/informe.pdf',
        attachmentName: 'informe.pdf',
        filePurged: true,
      },
    });

    const mine = await service.getMySubmission('tarea-1', STUDENT);

    expect(mine).toMatchObject({ fileName: 'informe.pdf', fileUrl: null, filePurged: true, score: 90 });
    expect(storage.downloadUrl).not.toHaveBeenCalled();
  });
});
