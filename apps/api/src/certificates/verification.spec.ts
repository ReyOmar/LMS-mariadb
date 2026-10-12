import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificateSnapshot } from './certificate-data.service';

/**
 * Verificación pública y descarga del PDF.
 *
 * Un certificado sobrevive a la cuenta de su titular y al curso del que salió: se sigue
 * verificando con el nombre y la sede con que se emitió, también cuando el código es de la
 * otra sede.
 */
describe('CertificatesService — verificación y descarga', () => {
  const STORED = {
    verificationCode: 'CERT-ABC123',
    holderName: 'Ana Ramírez',
    completedAt: new Date('2026-02-20T00:00:00Z'),
    validUntil: null,
    averageScore: 90,
    totalHours: 4,
    courseTitle: 'Manejo defensivo',
    userGuid: 'ana' as string | null,
    pdfKey: 'certificados/a.pdf',
    pdfData: null as string | null,
    country: 'MEXICO',
  };

  const RECOMPOSED = Buffer.from('%PDF-1.7 recompuesto');

  function serviceWith(stored: Partial<typeof STORED> | null, { fileOnDisk = true, saveFails = false } = {}) {
    const issuers: string[] = [];
    const prisma = {
      certificate: { findUnique: async () => (stored ? { ...STORED, ...stored } : null) },
    };
    const storage = {
      readFile: async () => (fileOnDisk ? Buffer.from('%PDF-1.7') : null),
      saveWithKey: jest.fn(async () => {
        if (saveFails) throw new Error('disco lleno');
      }),
    };
    const data = {
      issuer: async (country: string) => {
        issuers.push(country);
        return { country, platformName: 'PESV Education' };
      },
      compose: jest.fn(async (_snapshot: CertificateSnapshot) => RECOMPOSED),
    };
    const service = new CertificatesService(
      prisma as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      data as never,
      {} as never,
    );
    for (const level of ['warn', 'error'] as const) {
      jest.spyOn(service['logger'], level).mockImplementation(() => undefined);
    }
    return { service, issuers, storage, data };
  }

  const ANA = { sub: 'ana', role: 'STUDENT', country: 'MEXICO' } as never;

  it('muestra el nombre con que se emitió y la sede que lo emitió', async () => {
    const { service } = serviceWith({});

    const result = await service.verifyByCode('cert-abc123');

    expect(result).toMatchObject({
      valid: true,
      certificate: {
        studentName: 'Ana Ramírez',
        issuer: { country: 'MEXICO', platformName: 'PESV Education' },
      },
    });
  });

  it('sin cuenta ni curso sigue verificándose y nombra la sede que lo emitió', async () => {
    const { service, issuers } = serviceWith({ userGuid: null });

    const result = await service.verifyByCode('CERT-ABC123');

    expect(result).toMatchObject({ valid: true, certificate: { studentName: 'Ana Ramírez' } });
    expect(issuers).toEqual(['MEXICO']);
  });

  it('un código que no existe no es válido', async () => {
    const { service } = serviceWith(null);

    expect(await service.verifyByCode('CERT-NADA')).toMatchObject({ valid: false });
  });

  it('un administrador de la sede descarga el PDF de una cuenta ya borrada', async () => {
    const { service } = serviceWith({ userGuid: null });
    const admin = { sub: 'admin-1', role: 'ADMIN', country: 'MEXICO' };

    const pdf = await service.getPdf('certificado-1', admin as never);

    expect(pdf.fileName).toBe('Certificado - Manejo defensivo.pdf');
  });

  it('un administrador de la otra sede no puede descargarlo', async () => {
    const { service } = serviceWith({ userGuid: null });
    const admin = { sub: 'admin-2', role: 'ADMIN', country: 'COLOMBIA' };

    await expect(service.getPdf('certificado-1', admin as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('si falta el PDF, lo recompone con lo que se imprimió al emitirlo y lo vuelve a guardar', async () => {
    const snapshot = { studentName: 'Ana Ramírez', completedAt: new Date('2026-02-20T00:00:00Z'), validUntil: null };
    const { service, storage, data } = serviceWith(
      { pdfData: JSON.stringify({ ...snapshot, startedAt: new Date('2026-01-10T00:00:00Z') }) },
      { fileOnDisk: false },
    );

    const pdf = await service.getPdf('certificado-1', ANA);

    expect(pdf.content).toBe(RECOMPOSED);
    expect(data.compose).toHaveBeenCalledWith(expect.objectContaining(snapshot));
    expect(storage.saveWithKey).toHaveBeenCalledWith('certificados/a.pdf', RECOMPOSED);
  });

  it('entrega el PDF recompuesto aunque no se pueda volver a guardar', async () => {
    const { service } = serviceWith(
      { pdfData: JSON.stringify({ completedAt: '2026-02-20T00:00:00Z', startedAt: '2026-01-10T00:00:00Z' }) },
      { fileOnDisk: false, saveFails: true },
    );

    expect((await service.getPdf('certificado-1', ANA)).content).toBe(RECOMPOSED);
  });

  it('sin el PDF ni sus datos lo dice sin prometer una reemisión que no existe', async () => {
    const { service } = serviceWith({ pdfData: null }, { fileOnDisk: false });

    const download = service.getPdf('certificado-1', ANA);

    await expect(download).rejects.toBeInstanceOf(NotFoundException);
    await expect(download).rejects.toThrow(/copia de seguridad/);
  });
});
