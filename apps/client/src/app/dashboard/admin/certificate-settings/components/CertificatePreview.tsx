'use client';

import { fileUrlFor } from '@/lib/api';
import { CERTIFICATE_TEXT, SAMPLE_CERTIFICATE, previewMetrics, type CertificateSettings } from '../certificate';
import type { CourseSigner } from '../useCertificateSample';

export interface Brand {
  platformName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

/** Certificado de muestra a escala, con los textos y el orden del PDF. */
export function CertificatePreview({
  settings,
  brand,
  signer,
}: {
  settings: CertificateSettings;
  brand: Brand;
  signer: CourseSigner | null;
}) {
  const { primaryColor: primary, secondaryColor: secondary } = brand;
  const logo = fileUrlFor(brand.logoUrl);
  const teacher = signer?.teacher;
  const signature = fileUrlFor(teacher?.signatureUrl);

  return (
    <div
      className="relative bg-white rounded-2xl border-2 border-border shadow-lg overflow-hidden mx-auto"
      style={{ aspectRatio: '842/595', maxWidth: '100%', minHeight: '420px' }}
    >
      <div className="absolute inset-0 p-[5%] flex flex-col items-center justify-between text-center">
        <div
          className="absolute top-0 left-0 right-0 h-2 rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-2 rounded-b-2xl"
          style={{ background: `linear-gradient(90deg, ${secondary}, ${primary})` }}
        />

        <div className="flex flex-col items-center gap-1 pt-2">
          {logo ? (
            <img src={logo} alt="" className="h-12 max-w-[8rem] object-contain" />
          ) : (
            <p className="text-xs tracking-[0.25em] font-semibold uppercase" style={{ color: primary }}>
              {brand.platformName}
            </p>
          )}
          <div
            className="w-20 h-[2px] my-1"
            style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
          />
          <p className="text-2xl font-black text-slate-800 tracking-wide">
            {settings.certCustomTitle || CERTIFICATE_TEXT.title}
          </p>
          <p className="text-xs tracking-[0.3em] text-slate-500 font-medium">
            {settings.certSubtitle || CERTIFICATE_TEXT.subtitle}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400 italic">{CERTIFICATE_TEXT.grantedTo}</p>
          <p className="text-xl font-bold italic" style={{ color: primary }}>
            {SAMPLE_CERTIFICATE.studentName}
          </p>
          <div className="w-32 h-[2px]" style={{ background: primary, opacity: 0.3 }} />
          <p className="text-xs text-slate-500 italic">{CERTIFICATE_TEXT.completion}</p>
          <p className="text-base font-bold text-slate-800">
            &ldquo;{signer?.title || SAMPLE_CERTIFICATE.courseTitle}&rdquo;
          </p>
          <p className="text-[11px] text-slate-500 max-w-[85%] leading-relaxed mt-1 break-words">
            {settings.certLegalText || SAMPLE_CERTIFICATE.legalText}
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 flex-wrap">
          {previewMetrics(settings).map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
              <p className="text-xs font-bold text-slate-700">{value}</p>
            </div>
          ))}
        </div>

        {settings.certShowSignature && (
          <div className="flex flex-col items-center gap-1">
            {signature && (
              <div className="h-14 w-32 flex items-center justify-center">
                <img src={signature} alt="Firma del examinador" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <div className="w-36 h-[1px] bg-slate-300" />
            <p className="text-xs font-bold text-slate-700 mt-1">
              {teacher?.signatureName ||
                (teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Nombre del examinador')}
            </p>
            <p className="text-[11px] text-slate-500">{teacher?.signatureTitle || CERTIFICATE_TEXT.signatureTitle}</p>
          </div>
        )}

        <p className="text-[9px] text-slate-400 pb-1">
          {CERTIFICATE_TEXT.verification}: {SAMPLE_CERTIFICATE.verificationCode}
        </p>
      </div>
    </div>
  );
}
