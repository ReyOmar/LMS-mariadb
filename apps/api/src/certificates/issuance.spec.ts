import { CertificatesService } from './certificates.service';
import { SubmissionFilesService } from './submission-files.service';
import { FileOwnershipService } from '../storage/file-ownership.service';

const COMPLETED_AT = new Date('2026-02-20T00:00:00Z');

/**
 * Emisión de un certificado.
 *
 * Emitirlo guarda su PDF, cierra la vuelta y retira del disco los archivos que el alumno entregó
 * en ella; las entregas conservan el nombre, la nota y el comentario. Los archivos se borran
 * sólo cuando la emisión está confirmada, y dos emisiones simultáneas del mismo alumno y curso
 * se ponen en fila sobre la matrícula: sólo la primera registra, guarda y retira algo.
 */
describe('CertificatesService — emisión del certificado', () => {
  interface SubmissionRow {
    guid: string;
    userGuid: string;
    courseGuid: string;
    assignmentGuid: string;
    status: string;
    attachmentKey: string | null;
    attachmentName: string | null;
    filePurged: boolean;
    score: number | null;
    feedback: string | null;
  }

  type SubmissionWhere = {
    guid?: { in: string[] };
    userGuid?: string;
    assignmentGuid?: { in: string[] };
    attachmentKey?: { not: null } | { in: string[] };
    assignment?: { module: { courseGuid: string } };
  };

  function delivery(guid: string, changes: Partial<SubmissionRow> = {}): SubmissionRow {
    return {
      guid,
      userGuid: 'ana',
      courseGuid: 'curso-1',
      assignmentGuid: 'tarea-1',
      status: 'GRADED',
      attachmentKey: `entregas/${guid}.pdf`,
      attachmentName: `${guid}.pdf`,
      filePurged: false,
      score: 90,
      feedback: 'Muy completo.',
      ...changes,
    };
  }

  function matches(row: SubmissionRow, where: SubmissionWhere): boolean {
    const key = where.attachmentKey;
    return (
      (!where.guid || where.guid.in.includes(row.guid)) &&
      (!where.userGuid || row.userGuid === where.userGuid) &&
      (!where.assignmentGuid || where.assignmentGuid.in.includes(row.assignmentGuid)) &&
      (!where.assignment || row.courseGuid === where.assignment.module.courseGuid) &&
      (!key || ('in' in key ? key.in.includes(row.attachmentKey as string) : row.attachmentKey !== null))
    );
  }

  interface Scenario {
    /** Certificados de vueltas anteriores por este curso. */
    previousCertificates?: number;
    /** La vuelta actual ya está cerrada cuando se llega al bloqueo. */
    alreadyClosed?: boolean;
    /** El registro del certificado falla. */
    failCreate?: boolean;
    /** La transacción termina su trabajo, pero la base no llega a confirmarla. */
    failCommit?: boolean;
    /** El disco no deja borrar los archivos entregados. */
    failFileDeletion?: boolean;
    submissions?: SubmissionRow[];
  }

  function setup({
    previousCertificates = 0,
    alreadyClosed = false,
    failCreate = false,
    failCommit = false,
    failFileDeletion = false,
    submissions = [delivery('informe'), delivery('mapa-de-riesgos', { assignmentGuid: 'tarea-2' })],
  }: Scenario = {}) {
    const steps: string[] = [];
    const saved: string[] = [];
    const deleted: string[] = [];
    const enrollmentWrites: { where: unknown; data: unknown }[] = [];
    const created: Record<string, unknown>[] = [];
    const notifications: Record<string, unknown>[] = [];
    const staffEvents: unknown[][] = [];

    // Lo confirmado. Cada transacción trabaja sobre una copia que sólo pasa aquí si se confirma.
    let committed = {
      completedAt: alreadyClosed ? COMPLETED_AT : (null as Date | null),
      certificates: previousCertificates,
      submissions,
    };

    function submissionTable(state: typeof committed) {
      return {
        findMany: async ({ where }: { where: SubmissionWhere }) =>
          state.submissions.filter((row) => matches(row, where)),
        updateMany: async ({ where, data }: { where: SubmissionWhere; data: Partial<SubmissionRow> }) => {
          steps.push('marcar entregas');
          state.submissions = state.submissions.map((row) => (matches(row, where) ? { ...row, ...data } : row));
          return { count: 1 };
        },
      };
    }

    function transactionOn(state: typeof committed) {
      return {
        $queryRaw: async () => [{ active: 1, completedAt: state.completedAt }],
        certificate: {
          count: async () => state.certificates,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            if (failCreate) throw new Error('Fallo de la base');
            state.certificates++;
            created.push(data);
            return { guid: `certificado-${state.certificates}` };
          },
        },
        enrollment: {
          updateMany: async (query: { where: unknown; data: { completedAt: Date } }) => {
            enrollmentWrites.push(query);
            state.completedAt = query.data.completedAt;
            return { count: 1 };
          },
        },
        submission: submissionTable(state),
      };
    }

    // El bloqueo de la matrícula: las transacciones corren de una en una, como con FOR UPDATE.
    let queue: Promise<unknown> = Promise.resolve();
    const none = { findMany: async () => [] };

    const prisma = {
      enrollment: { findUnique: async () => ({ completedAt: committed.completedAt }) },
      resourceProgress: { findMany: async () => [{ resourceGuid: 'tarea-1' }, { resourceGuid: 'tarea-2' }] },
      get submission() {
        return submissionTable(committed);
      },
      // Lo que mira la regla de borrado antes de retirar un archivo.
      course: none,
      resource: none,
      user: none,
      countrySettings: none,
      certificate: { findMany: async () => [] },
      $transaction: (callback: (client: ReturnType<typeof transactionOn>) => Promise<unknown>) => {
        const run = queue.then(async () => {
          const draft = structuredClone(committed);
          const result = await callback(transactionOn(draft));
          if (failCommit) throw new Error('Se perdió la conexión al confirmar');
          committed = draft;
          steps.push('confirmar');
          return result;
        });
        queue = run.catch(() => undefined);
        return run;
      },
    };
    const access = {
      ensureEnrollment: async () => undefined,
      getCourseResources: async () => [
        { guid: 'tarea-1', type: 'ASSIGNMENT', title: 'Informe' },
        { guid: 'tarea-2', type: 'ASSIGNMENT', title: 'Mapa de riesgos' },
      ],
    };
    const storage = {
      saveWithKey: async (key: string) => {
        saved.push(key);
      },
      deleteFiles: async (keys: string[]) => {
        if (failFileDeletion && keys.some((key) => key.startsWith('entregas/'))) {
          throw new Error('Permiso denegado');
        }
        steps.push('borrar archivos');
        deleted.push(...keys);
      },
    };
    const realtime = {
      emitToUsers: () => undefined,
      emitToCourseStaff: (...args: unknown[]) => staffEvents.push(args),
    };
    const mail = { sendCertificateIssued: async () => undefined, sendCourseCompleted: async () => undefined };
    const data = {
      gather: async () => ({
        activeSeconds: 3600,
        studentEmail: 'ana@ejemplo.com',
        studentName: 'Ana',
        teacherGuid: 'carlos',
        teacherEmail: 'carlos@ejemplo.com',
        teacherName: 'Carlos',
        certificate: {
          studentName: 'Ana Ramírez',
          courseTitle: 'Manejo defensivo',
          verificationCode: 'CERT-ABC123',
          startedAt: new Date('2026-01-10T00:00:00Z'),
          completedAt: COMPLETED_AT,
          validUntil: null,
          totalHours: 4,
          averageScore: 90,
          logoKey: 'logos/sede.png',
          signatureKey: null,
        },
      }),
      // Componer el PDF de verdad no aporta nada aquí: lo cubre `certificate-pdf.spec.ts`.
      compose: async () => Buffer.from('%PDF-1.7'),
    };
    const notificationsService = {
      create: async (notification: Record<string, unknown>) => {
        notifications.push(notification);
      },
    };

    const files = new FileOwnershipService(prisma as never, storage as never);
    const fileWarnings = jest.spyOn(files['logger'], 'warn').mockImplementation(() => undefined);
    const service = new CertificatesService(
      prisma as never,
      access as never,
      storage as never,
      realtime as never,
      mail as never,
      data as never,
      notificationsService as never,
      new SubmissionFilesService(prisma as never, files),
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    return {
      service,
      steps,
      saved,
      deleted,
      enrollmentWrites,
      created,
      notifications,
      staffEvents,
      fileWarnings,
      submissions: () => committed.submissions,
    };
  }

  /** Deja correr lo que la emisión lanza sin esperar, como los avisos. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('marca las entregas de la vuelta como retiradas y borra sus archivos sólo tras confirmar', async () => {
    const { service, steps, deleted, submissions } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(steps).toEqual(['marcar entregas', 'confirmar', 'borrar archivos']);
    expect(deleted).toEqual(['entregas/informe.pdf', 'entregas/mapa-de-riesgos.pdf']);
    expect(submissions().map((row) => [row.attachmentKey, row.filePurged])).toEqual([
      [null, true],
      [null, true],
    ]);
  });

  it('las entregas retiradas conservan el nombre del archivo, el estado, la nota y el comentario', async () => {
    const { service, submissions } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(submissions()[0]).toMatchObject({
      attachmentName: 'informe.pdf',
      status: 'GRADED',
      score: 90,
      feedback: 'Muy completo.',
    });
  });

  it('no toca las entregas de otros cursos ni las de otros alumnos', async () => {
    const otherCourse = delivery('otro-curso', { courseGuid: 'curso-2' });
    const otherStudent = delivery('de-beto', { userGuid: 'beto' });
    const { service, deleted, submissions } = setup({
      submissions: [delivery('informe'), delivery('mapa', { assignmentGuid: 'tarea-2' }), otherCourse, otherStudent],
    });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(deleted).toEqual(['entregas/informe.pdf', 'entregas/mapa.pdf']);
    expect(submissions()).toEqual(expect.arrayContaining([otherCourse, otherStudent]));
  });

  it('el PDF del certificado nunca se borra', async () => {
    const { service, saved, deleted } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(saved).toEqual([expect.stringMatching(/^certificados\/.+\.pdf$/)]);
    expect(deleted).not.toContain(saved[0]);
  });

  it('un fallo al borrar los archivos no deshace el certificado: queda registrado', async () => {
    const { service, created, notifications, submissions, fileWarnings } = setup({ failFileDeletion: true });

    await expect(service.issueIfEligible('curso-1', 'ana', 'COLOMBIA')).resolves.toBeUndefined();
    await settle();

    expect(created).toHaveLength(1);
    expect(submissions().every((row) => row.filePurged)).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(fileWarnings).toHaveBeenCalled();
  });

  it('deja terminada la matrícula con la fecha del certificado', async () => {
    const { service, enrollmentWrites } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(enrollmentWrites).toEqual([
      { where: { userGuid: 'ana', courseGuid: 'curso-1' }, data: { completedAt: COMPLETED_AT } },
    ]);
  });

  it('guarda el nombre del titular tal como figura en el diploma y la sede que lo emite', async () => {
    const { service, created } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(created[0]).toMatchObject({ userGuid: 'ana', holderName: 'Ana Ramírez', country: 'COLOMBIA' });
  });

  it('dos emisiones simultáneas dejan un solo certificado y un solo PDF, y retiran los archivos una vez', async () => {
    // El último avance y la última calificación llegan casi a la vez.
    const { service, saved, deleted, created, steps } = setup();

    await Promise.all([
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
    ]);
    await settle();

    expect(created).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(steps.filter((step) => step === 'marcar entregas')).toHaveLength(1);
    expect(deleted).toEqual(['entregas/informe.pdf', 'entregas/mapa-de-riesgos.pdf']);
  });

  it('numera la vuelta a partir de los certificados anteriores del curso', async () => {
    const { service, created } = setup({ previousCertificates: 1 });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(created[0]).toMatchObject({ attempt: 2 });
  });

  it('la segunda certificación retira sólo los archivos de la vuelta nueva', async () => {
    // Las entregas de la primera vuelta ya están archivadas, sin archivo; quedan las de ésta.
    const { service, deleted } = setup({
      previousCertificates: 1,
      submissions: [delivery('informe-segunda-vuelta'), delivery('mapa-segunda-vuelta', { assignmentGuid: 'tarea-2' })],
    });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(deleted).toEqual(['entregas/informe-segunda-vuelta.pdf', 'entregas/mapa-segunda-vuelta.pdf']);
  });

  it('con la vuelta ya cerrada no registra, ni guarda, ni retira nada', async () => {
    const { service, saved, created, notifications, deleted, submissions } = setup({ alreadyClosed: true });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(created).toEqual([]);
    expect(saved).toEqual([]);
    expect(deleted).toEqual([]);
    expect(notifications).toEqual([]);
    expect(submissions().every((row) => row.attachmentKey)).toBe(true);
  });

  it('si el registro falla, retira el PDF que acababa de guardar y las entregas conservan su archivo', async () => {
    const { service, saved, deleted, submissions } = setup({ failCreate: true });

    await expect(service.issueIfEligible('curso-1', 'ana', 'COLOMBIA')).rejects.toThrow('Fallo de la base');

    expect(saved).toHaveLength(1);
    expect(deleted).toEqual(saved);
    expect(submissions().every((row) => row.attachmentKey && !row.filePurged)).toBe(true);
  });

  it('si la base no confirma la emisión, retira el PDF y no borra ningún archivo entregado', async () => {
    const { service, saved, deleted, notifications, submissions } = setup({ failCommit: true });

    await expect(service.issueIfEligible('curso-1', 'ana', 'COLOMBIA')).rejects.toThrow('al confirmar');
    await settle();

    expect(saved).toHaveLength(1);
    expect(deleted).toEqual(saved);
    expect(notifications).toEqual([]);
    expect(submissions().every((row) => row.attachmentKey && !row.filePurged)).toBe(true);
  });

  it('guarda con el certificado lo que imprime su PDF, para poder recomponerlo si se pierde', async () => {
    const { service, created } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(JSON.parse(created[0].pdfData as string)).toMatchObject({
      studentName: 'Ana Ramírez',
      verificationCode: 'CERT-ABC123',
      completedAt: COMPLETED_AT.toISOString(),
      logoKey: 'logos/sede.png',
    });
  });

  it('avisa al alumno en la campana, con enlace a sus certificados, de que sus archivos se retiraron', async () => {
    const { service, notifications } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(notifications).toEqual([
      expect.objectContaining({
        userGuid: 'ana',
        country: 'COLOMBIA',
        type: 'BADGE_UNLOCKED',
        actionUrl: '/dashboard/student/certificates',
        refType: 'certificado',
        refGuid: 'certificado-1',
        message: expect.stringContaining('se retiraron del campus; tus calificaciones se conservan'),
      }),
    ]);
  });

  it('avisa al personal del curso de que la vuelta del alumno quedó cerrada', async () => {
    const { service, staffEvents } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(staffEvents).toEqual([['round:closed', { courseGuid: 'curso-1', userGuid: 'ana' }, 'COLOMBIA', 'carlos']]);
  });

  it('sin archivos que retirar también avisa al personal del cierre, pero la campana no menciona archivos', async () => {
    // Un curso de cuestionarios: los intentos no llevan archivo.
    const { service, staffEvents, notifications, deleted } = setup({
      submissions: [
        delivery('intento-1', { attachmentKey: null, attachmentName: null }),
        delivery('intento-2', { assignmentGuid: 'tarea-2', attachmentKey: null, attachmentName: null }),
      ],
    });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(deleted).toEqual([]);
    expect(staffEvents).toEqual([['round:closed', { courseGuid: 'curso-1', userGuid: 'ana' }, 'COLOMBIA', 'carlos']]);
    expect(notifications[0].message).not.toMatch(/archivos/);
  });

  it('dos emisiones simultáneas avisan del cierre una sola vez', async () => {
    const { service, staffEvents } = setup();

    await Promise.all([
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
    ]);

    expect(staffEvents).toHaveLength(1);
  });

  it('con la vuelta ya cerrada no vuelve a avisar del cierre', async () => {
    const { service, staffEvents } = setup({ alreadyClosed: true });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(staffEvents).toEqual([]);
  });
});
