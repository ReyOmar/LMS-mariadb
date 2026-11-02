import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatScore } from '@/lib/grading';
import { longDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { issuedBy } from './issuer';
import type { Verdict } from './useCertificateVerification';

/**
 * Lo que dice la verificación: auténtico, con los datos del documento, o no encontrado. La región
 * existe desde el principio para que el lector de pantalla anuncie el resultado al llegar.
 */
export function CertificateVerdict({ verdict }: { verdict: Verdict | null }) {
  return <div role="status">{verdict && <VerdictCard verdict={verdict} />}</div>;
}

function VerdictCard({ verdict }: { verdict: Verdict }) {
  if (verdict.status === 'invalid') {
    return (
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Certificado no encontrado</h2>
        <p className="text-muted-foreground">{verdict.message}</p>
      </div>
    );
  }

  const { certificate } = verdict;

  return (
    <div className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-500/5 p-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
          <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div>
          <h2 className="text-xl font-bold">Certificado auténtico</h2>
          <p className="text-sm text-muted-foreground">
            {issuedBy(certificate.issuer)}
            {!certificate.unexpired && ' Su periodo de vigencia ya terminó.'}
          </p>
        </div>
      </div>

      <dl className="space-y-4">
        <CertificateFact label="Titular" value={certificate.studentName} highlighted />
        <CertificateFact label="Programa" value={certificate.course} highlighted />
        <CertificateFact label="Fecha de emisión" value={longDate(certificate.issuedAt)} />
        <CertificateFact
          label="Intensidad horaria"
          value={`${certificate.hours} ${plural(certificate.hours, 'hora', 'horas')}`}
        />
        {certificate.validUntil && (
          <CertificateFact
            label={certificate.unexpired ? 'Válido hasta' : 'Venció el'}
            value={longDate(certificate.validUntil)}
          />
        )}
        <CertificateFact
          label="Calificación"
          value={formatScore(certificate.averageScore, certificate.issuer.country)}
        />
        <CertificateFact label="Código" value={certificate.verificationCode} monospace />
      </dl>
    </div>
  );
}

function CertificateFact({
  label,
  value,
  highlighted,
  monospace,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
  monospace?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`${highlighted ? 'text-lg font-bold' : 'font-medium'} ${monospace ? 'font-mono text-sm' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
