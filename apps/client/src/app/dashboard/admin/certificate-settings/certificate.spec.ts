import {
  addMonths,
  certificateDate,
  certificatePayload,
  previewMetrics,
  type CertificateSettings,
} from './certificate';

const settings: CertificateSettings = {
  certCustomTitle: null,
  certSubtitle: null,
  certLegalText: null,
  certShowModules: false,
  certShowResources: false,
  certShowScore: false,
  certShowSignature: true,
  certShowEnrollmentDate: false,
  certValidityMonths: null,
};

const labels = (overrides: Partial<CertificateSettings>) =>
  previewMetrics({ ...settings, ...overrides }).map((metric) => metric.label);

describe('previewMetrics', () => {
  it('siempre muestra la expedición y la intensidad horaria, como el PDF', () => {
    expect(labels({})).toEqual(['Fecha de expedición', 'Intensidad horaria']);
  });

  it('sigue el orden del PDF con todas las cifras activas', () => {
    expect(
      labels({
        certShowEnrollmentDate: true,
        certShowModules: true,
        certShowResources: true,
        certShowScore: true,
        certValidityMonths: 12,
      }),
    ).toEqual([
      'Fecha de inscripción',
      'Fecha de expedición',
      'Intensidad horaria',
      'Válido hasta',
      'Módulos',
      'Recursos',
      'Calificación promedio',
    ]);
  });

  it('muestra la vigencia sumando los meses a la fecha de expedición', () => {
    const validity = previewMetrics({ ...settings, certValidityMonths: 12 }).find(
      (metric) => metric.label === 'Válido hasta',
    );
    expect(validity?.value).toBe('05/05/2027');
  });

  it('sin vigencia no promete ninguna fecha de caducidad', () => {
    expect(labels({ certValidityMonths: 0 })).not.toContain('Válido hasta');
  });
});

describe('fechas del certificado', () => {
  it('se escriben como en el PDF', () => {
    expect(certificateDate(new Date(2026, 0, 7))).toBe('07/01/2026');
  });

  it('un mes después del 31 de enero es el último día de febrero', () => {
    expect(certificateDate(addMonths(new Date(2026, 0, 31), 1))).toBe('28/02/2026');
  });
});

describe('certificatePayload', () => {
  it('envía como «sin configurar» los textos vaciados y la vigencia a cero', () => {
    expect(certificatePayload({ certCustomTitle: '  ', certLegalText: '', certValidityMonths: 0 })).toEqual({
      certCustomTitle: null,
      certLegalText: null,
      certValidityMonths: null,
    });
  });

  it('no añade campos que no cambiaron', () => {
    expect(certificatePayload({ certShowScore: true })).toEqual({ certShowScore: true });
  });
});
