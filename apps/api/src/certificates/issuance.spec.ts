import { Prisma } from '@prisma/client';
import { CertificatesService } from './certificates.service';

// Componer el PDF de verdad no aporta nada aquí: lo cubre `certificate-pdf.spec.ts`.
jest.mock('./certificate-pdf', () => ({ composeCertificate: async () => Buffer.from('%PDF-1.7') }));

/**
 * Qué archivos toca la emisión de un certificado.
 *
 * Emitirlo guarda su PDF y nada más: las entregas del alumno conservan sus archivos, que
 * siguen a su alcance y al del examinador. Lo único que la emisión puede retirar es el PDF
 * duplicado que ella misma acaba de componer cuando otra emisión simultánea se le adelantó,
 * y que ninguna fila referencia.
 */
describe('CertificatesService — archivos al emitir el certificado', () => {
  function setup({ collision = false } = {}) {
    const saved: string[] = [];
    const deleted: string[] = [];
    const submissionWrites: string[] = [];
    const enrollmentWrites: { where: unknown; data: unknown }[] = [];
    let certificateLookups = 0;

    const prisma = {
      enrollment: {
        findUnique: async () => ({ enrolledAt: new Date('2026-01-10T00:00:00Z') }),
        updateMany: async (query: { where: unknown; data: unknown }) => {
          enrollmentWrites.push(query);
          return { count: 1 };
        },
      },
      certificate: {
        // Antes de emitir no hay certificado de esta vuelta; tras el choque, está el de la otra emisión.
        findFirst: async () => (collision && certificateLookups++ > 0 ? { id: 1 } : null),
        count: async () => 0,
        create: async () => {
          if (collision) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'prueba',
            });
          }
          return { guid: 'certificado-1' };
        },
      },
      resourceProgress: { findMany: async () => [{ resourceGuid: 'tarea-1' }] },
      // Las operaciones de la transacción ya se lanzaron al construirlas.
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
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
          completedAt: new Date('2026-02-20T00:00:00Z'),
          validUntil: null,
          totalHours: 4,
          averageScore: 90,
        },
      }),
    };

    const service = new CertificatesService(
      prisma as never,
      access as never,
      storage as never,
      realtime as never,
      mail as never,
      data as never,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    return { service, saved, deleted, submissionWrites, enrollmentWrites };
  }

  /** Deja correr lo que la emisión lanza sin esperar, como los avisos por correo. */
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
      { where: { userGuid: 'ana', courseGuid: 'curso-1' }, data: { completedAt: new Date('2026-02-20T00:00:00Z') } },
    ]);
  });

  it('si otra emisión simultánea se adelantó, sólo retira el PDF duplicado que acaba de componer', async () => {
    const { service, saved, deleted, submissionWrites } = setup({ collision: true });

    await service.issueIfEligible('curso-1', 'ana', 'COLOMBIA');
    await settle();

    expect(saved).toHaveLength(1);
    expect(deleted).toEqual(saved);
    expect(submissionWrites).toEqual([]);
  });
});
