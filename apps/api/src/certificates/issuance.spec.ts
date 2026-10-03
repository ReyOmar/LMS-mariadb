import { CertificatesService } from './certificates.service';

// Componer el PDF de verdad no aporta nada aquí: lo cubre `certificate-pdf.spec.ts`.
jest.mock('./certificate-pdf', () => ({ composeCertificate: async () => Buffer.from('%PDF-1.7') }));

const COMPLETED_AT = new Date('2026-02-20T00:00:00Z');

/**
 * Emisión de un certificado.
 *
 * Emitirlo guarda su PDF y nada más: las entregas del alumno conservan sus archivos, que
 * siguen a su alcance y al del examinador. Dos emisiones simultáneas del mismo alumno y
 * curso se ponen en fila sobre la matrícula, y sólo la primera registra y guarda algo.
 */
describe('CertificatesService — emisión del certificado', () => {
  interface Scenario {
    /** Certificados de vueltas anteriores por este curso. */
    previousCertificates?: number;
    /** La vuelta actual ya está cerrada cuando se llega al bloqueo. */
    alreadyClosed?: boolean;
    /** El registro del certificado falla. */
    failCreate?: boolean;
  }

  function setup({ previousCertificates = 0, alreadyClosed = false, failCreate = false }: Scenario = {}) {
    const saved: string[] = [];
    const deleted: string[] = [];
    const submissionWrites: string[] = [];
    const enrollmentWrites: { where: unknown; data: unknown }[] = [];
    const created: Record<string, unknown>[] = [];
    const notifications: Record<string, unknown>[] = [];

    // Matrícula compartida por todas las emisiones: lo que confirma una lo ve la siguiente.
    const enrollment = { completedAt: alreadyClosed ? COMPLETED_AT : null };
    let certificates = previousCertificates;

    // Lo que se ejecuta con la matrícula bloqueada.
    const tx = {
      $queryRaw: async () => [{ completedAt: enrollment.completedAt }],
      certificate: {
        count: async () => certificates,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (failCreate) throw new Error('Fallo de la base');
          certificates++;
          created.push(data);
          return { guid: `certificado-${certificates}` };
        },
      },
      enrollment: {
        updateMany: async (query: { where: unknown; data: { completedAt: Date } }) => {
          enrollmentWrites.push(query);
          enrollment.completedAt = query.data.completedAt;
          return { count: 1 };
        },
      },
    };

    // El bloqueo de la matrícula: las transacciones corren de una en una, como con FOR UPDATE.
    let queue: Promise<unknown> = Promise.resolve();

    const prisma = {
      enrollment: { findUnique: async () => ({ enrolledAt: new Date('2026-01-10T00:00:00Z') }) },
      // Las dos emisiones simultáneas pasan la comprobación rápida antes de que ninguna confirme.
      certificate: { findFirst: async () => null },
      resourceProgress: { findMany: async () => [{ resourceGuid: 'tarea-1' }] },
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) => {
        const run = queue.then(() => callback(tx));
        queue = run.catch(() => undefined);
        return run;
      },
      submission: {
        findMany: async () => [{ assignmentGuid: 'tarea-1', status: 'GRADED' }],
        ...Object.fromEntries(
          ['update', 'updateMany', 'delete', 'deleteMany'].map((operation) => [
            operation,
            async () => {
              submissionWrites.push(operation);
            },
          ]),
        ),
      },
    };
    const access = {
      ensureEnrollment: async () => undefined,
      getCourseResources: async () => [{ guid: 'tarea-1', type: 'ASSIGNMENT', title: 'Informe' }],
    };
    const storage = {
      saveWithKey: async (key: string) => {
        saved.push(key);
      },
      deleteFile: async (key: string) => {
        deleted.push(key);
      },
      deleteFiles: async (keys: string[]) => {
        deleted.push(...keys);
      },
    };
    const realtime = { emitToUsers: () => undefined };
    const mail = { sendCertificateIssued: async () => undefined, sendCourseCompleted: async () => undefined };
    const data = {
      gather: async () => ({
        activeSeconds: 3600,
        studentEmail: 'ana@ejemplo.com',
        studentName: 'Ana',
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
        },
      }),
    };
    const notificationsService = {
      create: async (notification: Record<string, unknown>) => {
        notifications.push(notification);
      },
    };

    const service = new CertificatesService(
      prisma as never,
      access as never,
      storage as never,
      realtime as never,
      mail as never,
      data as never,
      notificationsService as never,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    return { service, saved, deleted, submissionWrites, enrollmentWrites, created, notifications };
  }

  /** Deja correr lo que la emisión lanza sin esperar, como los avisos. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('guarda el PDF y conserva los archivos de las entregas', async () => {
    const { service, saved, deleted, submissionWrites } = setup();

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^certificados\/.+\.pdf$/);
    expect(deleted).toEqual([]);
    expect(submissionWrites).toEqual([]);
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

  it('dos emisiones simultáneas dejan un solo certificado y un solo PDF', async () => {
    // El último avance y la última calificación llegan casi a la vez.
    const { service, saved, deleted, created } = setup();

    await Promise.all([
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
      service.issueIfEligible('curso-1', 'ana', 'COLOMBIA'),
    ]);
    await settle();

    expect(created).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(deleted).toEqual([]);
  });

  it('numera la vuelta a partir de los certificados anteriores del curso', async () => {
    const { service, created } = setup({ previousCertificates: 1 });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');

    expect(created[0]).toMatchObject({ attempt: 2 });
  });

  it('con la vuelta ya cerrada no registra ni guarda nada', async () => {
    const { service, saved, created, notifications } = setup({ alreadyClosed: true });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(created).toEqual([]);
    expect(saved).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it('si el registro falla, retira el PDF que acababa de guardar', async () => {
    const { service, saved, deleted } = setup({ failCreate: true });

    await expect(service.issueIfEligible('curso-1', 'ana', 'COLOMBIA')).rejects.toThrow('Fallo de la base');

    expect(saved).toHaveLength(1);
    expect(deleted).toEqual(saved);
  });

  it('avisa al alumno en la campana con enlace a sus certificados', async () => {
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
      }),
    ]);
  });
});
