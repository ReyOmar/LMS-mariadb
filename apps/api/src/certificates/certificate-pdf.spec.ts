import { composeCertificate, CertificateData } from './certificate-pdf';

/**
 * El certificado es el documento que justifica toda la plataforma. Aquí se fija lo mínimo:
 * que sale un PDF, y que no se cae con lo que llega de verdad —títulos con rayas y tildes,
 * cursos sin nota, sin logotipo o con una imagen que no se puede leer—.
 */
describe('composeCertificate', () => {
  const DATA: CertificateData = {
    studentName: 'Ana Ramírez Núñez',
    courseTitle: 'Manejo defensivo – nivel 1',
    startedAt: new Date(2026, 0, 10),
    completedAt: new Date(2026, 1, 20),
    totalHours: 4,
    validUntil: new Date(2028, 1, 20),
    averageScore: 88.5,
    verificationCode: 'CERT-ABC123-XYZ',
    teacherName: 'Carlos Pérez',
    platformName: 'PESV Education',
    primaryColor: '#0F766E',
    secondaryColor: '#65a30d',
    totalModules: 3,
    totalResources: 12,
    legalText: 'Texto legal de prueba.',
    customTitle: null,
    subtitle: null,
    showModules: true,
    showResources: true,
    showScore: true,
    showSignature: true,
    showEnrollmentDate: true,
    signatureName: 'Carlos Pérez',
    signatureTitle: 'Examinador',
    logo: null,
    signature: null,
  };

  function isPdf(content: Buffer): boolean {
    return content.subarray(0, 5).toString() === '%PDF-';
  }

  it('produce un PDF', async () => {
    const pdf = await composeCertificate(DATA);

    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('un curso sin evaluaciones no rompe la línea de la nota', async () => {
    expect(isPdf(await composeCertificate({ ...DATA, averageScore: null }))).toBe(true);
  });

  it('una imagen que no se puede leer no impide emitirlo', async () => {
    // Un logotipo en un formato que el PDF no sabe incrustar se sustituye por el nombre.
    const unreadable = Buffer.from('esto no es una imagen');

    expect(isPdf(await composeCertificate({ ...DATA, logo: unreadable, signature: unreadable }))).toBe(true);
  });
});
