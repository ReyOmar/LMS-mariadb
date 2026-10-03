import { ForbiddenException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

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
    country: 'MEXICO',
  };

  function serviceWith(stored: Partial<typeof STORED> | null) {
    const issuers: string[] = [];
    const prisma = {
      certificate: { findUnique: async () => (stored ? { ...STORED, ...stored } : null) },
    };
    const storage = { readFile: async () => ({ content: Buffer.from('%PDF-1.7') }) };
    const data = {
      issuer: async (country: string) => {
        issuers.push(country);
        return { country, platformName: 'PESV Education' };
      },
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
    return { service, issuers };
  }

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
});
