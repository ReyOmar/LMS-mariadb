import { MAX_SCORE } from '@/lib/grading';

export interface CertificateSettings {
  certCustomTitle: string | null;
  certSubtitle: string | null;
  certLegalText: string | null;
  certShowModules: boolean;
  certShowResources: boolean;
  certShowScore: boolean;
  certShowSignature: boolean;
  certShowEnrollmentDate: boolean;
  /** Meses que acredita el certificado; `null` o 0, sin caducidad. */
  certValidityMonths: number | null;
}

export type CertificateToggle = keyof Pick<
  CertificateSettings,
  'certShowEnrollmentDate' | 'certShowModules' | 'certShowResources' | 'certShowScore' | 'certShowSignature'
>;

/** Textos fijos del PDF (`apps/api/src/certificates/certificate-pdf.ts`): la vista previa dice lo mismo. */
export const CERTIFICATE_TEXT = {
  title: 'CERTIFICADO',
  subtitle: 'DE FINALIZACIÓN ACADÉMICA',
  grantedTo: 'El presente documento se otorga a:',
  completion: 'Por haber completado y aprobado satisfactoriamente los requisitos del programa formativo:',
  signatureTitle: 'Instructor / Examinador Académico',
  verification: 'Código de verificación institucional',
} as const;

/** Con más, el texto legal del PDF invade la fila de cifras, que se dibuja a una altura fija. */
export const MAX_LEGAL_TEXT_LENGTH = 280;

export const SAMPLE_CERTIFICATE = {
  studentName: 'Juan Pérez',
  courseTitle: 'Ejemplo de curso',
  enrolledAt: new Date(2026, 4, 1),
  issuedAt: new Date(2026, 4, 5),
  hours: 12,
  modules: 3,
  resources: 15,
  score: 92,
  verificationCode: 'CERT-2026-AB12C',
  legalText:
    'El presente certificado acredita que el participante cumplió satisfactoriamente la totalidad del programa ' +
    'de capacitación, compuesto por 3 módulos y 15 recursos formativos.',
} as const;

const emptyToNull = (text: string | null | undefined) => text?.trim() || null;

/** Lo que admite la API: los textos vacíos y la vigencia a cero significan «sin configurar». */
export function certificatePayload(changes: Partial<CertificateSettings>): Partial<CertificateSettings> {
  return {
    ...changes,
    ...('certCustomTitle' in changes && { certCustomTitle: emptyToNull(changes.certCustomTitle) }),
    ...('certSubtitle' in changes && { certSubtitle: emptyToNull(changes.certSubtitle) }),
    ...('certLegalText' in changes && { certLegalText: emptyToNull(changes.certLegalText) }),
    ...('certValidityMonths' in changes && { certValidityMonths: changes.certValidityMonths || null }),
  };
}

/** Las fechas del PDF: `dd/mm/aaaa`. */
export function certificateDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Como la API: el 31 de enero más un mes es el último día de febrero, no el 3 de marzo. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== date.getDate()) result.setDate(0);
  return result;
}

/** Fila de cifras del certificado de muestra, en el orden y con los rótulos del PDF. */
export function previewMetrics(settings: CertificateSettings): { label: string; value: string }[] {
  const sample = SAMPLE_CERTIFICATE;
  const months = settings.certValidityMonths ?? 0;
  const metrics = [
    settings.certShowEnrollmentDate && { label: 'Fecha de inscripción', value: certificateDate(sample.enrolledAt) },
    { label: 'Fecha de expedición', value: certificateDate(sample.issuedAt) },
    { label: 'Intensidad horaria', value: `${sample.hours} horas` },
    months > 0 && { label: 'Válido hasta', value: certificateDate(addMonths(sample.issuedAt, months)) },
    settings.certShowModules && { label: 'Módulos', value: String(sample.modules) },
    settings.certShowResources && { label: 'Recursos', value: String(sample.resources) },
    settings.certShowScore && { label: 'Calificación promedio', value: `${sample.score} / ${MAX_SCORE}` },
  ];
  return metrics.filter((metric): metric is { label: string; value: string } => Boolean(metric));
}
