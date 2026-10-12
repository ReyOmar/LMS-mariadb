import {
  CertificateDataService,
  CertificateSnapshot,
  defaultLegalText,
  parseSnapshot,
} from './certificate-data.service';

describe('defaultLegalText', () => {
  it('escribe cada cifra en singular o en plural', () => {
    expect(defaultLegalText(1, 1, 1)).toContain(
      'compuesto por 1 módulo y 1 recurso formativo, incluyendo 1 evaluación superada.',
    );
    expect(defaultLegalText(3, 12, 2)).toContain(
      'compuesto por 3 módulos y 12 recursos formativos, incluyendo 2 evaluaciones superadas.',
    );
  });

  it('no atribuye la calificación al examinador: los cuestionarios los corrige la plataforma', () => {
    expect(defaultLegalText(3, 12, 2)).not.toMatch(/examinador/);
  });

  it('sin evaluaciones no las menciona', () => {
    expect(defaultLegalText(2, 5, 0)).toMatch(/compuesto por 2 módulos y 5 recursos formativos\.$/);
  });
});

/**
 * La nota media del diploma.
 *
 * Se promedia la mejor nota de cada evaluación de la vuelta actual: los intentos
 * suspendidos antes de aprobar no la rebajan, y lo de una vuelta anterior no cuenta.
 */
describe('CertificateDataService — nota media del certificado', () => {
  function setup({ previousCertificate = null as Date | null } = {}) {
    const scoreQueries: unknown[] = [];
    const prisma = {
      user: { findUnique: async () => ({ firstName: 'Ana', lastName: 'Ramírez', email: 'ana@ejemplo.com' }) },
      course: {
        findUnique: async () => ({
          title: 'Manejo defensivo',
          durationHours: 4,
          teacher: { firstName: 'Carlos', lastName: 'Pérez', email: 'c@ejemplo.com', signatureUrl: null },
          _count: { modules: 2 },
        }),
      },
      enrollment: { findUnique: async () => ({ enrolledAt: new Date('2026-01-10T00:00:00Z') }) },
      certificate: { findFirst: async () => previousCertificate && { completedAt: previousCertificate } },
      submission: {
        // La base devuelve la mejor nota de cada evaluación.
        groupBy: async (query: unknown) => {
          scoreQueries.push(query);
          return [
            { assignmentGuid: 'cuestionario-1', _max: { score: 90 } },
            { assignmentGuid: 'tarea-1', _max: { score: 80 } },
          ];
        },
      },
      studySession: { aggregate: async () => ({ _sum: { durationSeconds: 3600 } }) },
    };
    const settings = {
      getSettings: async () => ({
        platformName: 'PESV Education',
        logoUrl: null,
        certShowSignature: false,
        certValidityMonths: null,
        certLegalText: null,
      }),
    };
    const access = {
      getCourseResources: async () => [
        { guid: 'cuestionario-1', type: 'ASSIGNMENT', title: 'Cuestionario' },
        { guid: 'tarea-1', type: 'ASSIGNMENT', title: 'Informe' },
      ],
    };
    const service = new CertificateDataService(prisma as never, {} as never, settings as never, access as never);
    return { service, scoreQueries };
  }

  it('promedia la mejor nota de cada evaluación', async () => {
    const { service, scoreQueries } = setup();

    const data = await service.gather('curso-1', 'ana', 'COLOMBIA');

    expect(data.certificate.averageScore).toBe(85);
    expect(scoreQueries[0]).toMatchObject({
      by: ['assignmentGuid'],
      where: { userGuid: 'ana', status: 'GRADED' },
      _max: { score: true },
    });
  });

  it('tras una certificación anterior sólo cuenta lo de la vuelta actual', async () => {
    const previous = new Date('2025-06-01T00:00:00Z');
    const { service, scoreQueries } = setup({ previousCertificate: previous });

    await service.gather('curso-1', 'ana', 'COLOMBIA');

    expect(scoreQueries[0]).toMatchObject({ where: { createdAt: { gt: previous } } });
  });

  it('el titular es el nombre completo con que se emite', async () => {
    const { service } = setup();

    const data = await service.gather('curso-1', 'ana', 'COLOMBIA');

    expect(data.certificate.studentName).toBe('Ana Ramírez');
  });
});

/** Imágenes del certificado y lo que se guarda para recomponerlo. */
describe('CertificateDataService — composición del PDF', () => {
  const SNAPSHOT: CertificateSnapshot = {
    studentName: 'Ana Ramírez',
    courseTitle: 'Manejo defensivo',
    startedAt: new Date('2026-01-10T00:00:00Z'),
    completedAt: new Date('2026-02-20T00:00:00Z'),
    totalHours: 4,
    validUntil: new Date('2028-02-20T00:00:00Z'),
    averageScore: 90,
    verificationCode: 'CERT-ABC123',
    teacherName: 'Carlos Pérez',
    platformName: 'PESV Education',
    primaryColor: '#0F766E',
    secondaryColor: '#65a30d',
    totalModules: 2,
    totalResources: 5,
    legalText: 'Texto legal.',
    customTitle: null,
    subtitle: null,
    showModules: true,
    showResources: true,
    showScore: true,
    showSignature: true,
    showEnrollmentDate: true,
    signatureName: 'Carlos Pérez',
    signatureTitle: 'Examinador',
    logoKey: 'logos/sede.png',
    signatureKey: 'firmas/carlos.png',
  };

  function setup() {
    const storage = { readFile: jest.fn(async () => null) };
    const service = new CertificateDataService({} as never, storage as never, {} as never, {} as never);
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    return { service, storage, warn };
  }

  it('lee el logotipo y la firma del almacenamiento para incrustarlos', async () => {
    const { service, storage } = setup();

    await service.compose(SNAPSHOT);

    expect(storage.readFile.mock.calls).toEqual([['logos/sede.png'], ['firmas/carlos.png']]);
  });

  it('un logotipo SVG no se intenta incrustar y el aviso dice qué formatos sirven', async () => {
    const { service, storage, warn } = setup();

    const pdf = await service.compose({ ...SNAPSHOT, logoKey: 'logos/sede.svg', showSignature: false });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(storage.readFile).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/sólo admite PNG o JPG/));
  });

  it('la instantánea guardada en JSON recupera sus fechas', () => {
    expect(parseSnapshot(JSON.stringify(SNAPSHOT))).toEqual(SNAPSHOT);
    expect(parseSnapshot(JSON.stringify({ ...SNAPSHOT, validUntil: null })).validUntil).toBeNull();
  });
});
