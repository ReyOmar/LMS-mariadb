import { CertificatesService } from './certificates.service';

/**
 * Cuándo procede el certificado: con la vuelta abierta, todos los recursos completados y todas
 * las tareas calificadas. Mientras no, ni siquiera se abre la transacción de la emisión.
 */
describe('CertificatesService — cuándo procede el certificado', () => {
  const RESOURCES = [
    { guid: 'lectura-1', type: 'TEXT', title: 'Lectura' },
    { guid: 'tarea-1', type: 'ASSIGNMENT', title: 'Informe' },
    { guid: 'cuestionario-1', type: 'ASSIGNMENT', title: 'Cuestionario' },
  ];
  const EVERYTHING = RESOURCES.map((resource) => resource.guid);
  const ALL_GRADED = ['tarea-1', 'cuestionario-1'];

  interface Scenario {
    enrollment?: { active: boolean; completedAt: Date | null } | null;
    resources?: typeof RESOURCES;
    completed?: string[];
    graded?: string[];
  }

  /** Si se llegó a intentar la emisión. */
  async function attemptsIssuance({
    enrollment = { active: true, completedAt: null },
    resources = RESOURCES,
    completed = EVERYTHING,
    graded = ALL_GRADED,
  }: Scenario = {}): Promise<boolean> {
    const prisma = {
      enrollment: { findUnique: async () => enrollment },
      resourceProgress: { findMany: async () => completed.map((resourceGuid) => ({ resourceGuid })) },
      submission: { findMany: async () => graded.map((assignmentGuid) => ({ assignmentGuid })) },
      // Aquí sólo importa si se llegó a abrirla; lo que pasa dentro lo cubre `issuance.spec.ts`.
      $transaction: jest.fn(async () => null),
    };
    const access = { getCourseResources: async () => resources };
    const service = new CertificatesService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.issueIfEligible('curso-1', 'alumna', 'COLOMBIA');
    return prisma.$transaction.mock.calls.length > 0;
  }

  it('con todo completado y calificado, la intenta', async () => {
    expect(await attemptsIssuance()).toBe(true);
  });

  it('sin matrícula, dada de baja o ya certificada, no', async () => {
    expect(await attemptsIssuance({ enrollment: null })).toBe(false);
    expect(await attemptsIssuance({ enrollment: { active: false, completedAt: null } })).toBe(false);
    expect(await attemptsIssuance({ enrollment: { active: true, completedAt: new Date() } })).toBe(false);
  });

  it('un curso sin contenido no se termina', async () => {
    expect(await attemptsIssuance({ resources: [], completed: [], graded: [] })).toBe(false);
  });

  it('con un recurso por completar, no', async () => {
    expect(await attemptsIssuance({ completed: ['tarea-1', 'cuestionario-1'] })).toBe(false);
  });

  it('una tarea desbloqueada por la espera cuenta como completada, pero sin nota no basta', async () => {
    expect(await attemptsIssuance({ graded: ['cuestionario-1'] })).toBe(false);
  });
});
