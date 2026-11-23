'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Calendar, Check, Clock, Copy, Download, Loader2, RotateCcw, ShieldCheck, Star } from 'lucide-react';
import { useState } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useSession } from '@/contexts/SessionContext';
import { longDate } from '@/lib/dates';
import { formatScore, formatScoreValue } from '@/lib/grading';
import type { Certificate } from '@/types/models';
import { formatHours } from '../certificate-text';

interface Props {
  certificate: Certificate;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

/** Un certificado: su vista en papel (abre la ficha), lo que acredita, el código y la descarga. */
export function CertificateCard({ certificate, downloading, onOpen, onDownload }: Props) {
  const { country } = useCountry();

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[18px] border border-border/60 bg-card shadow-sm">
      {/* El papel entero abre la ficha. El botón va encima del papel y no alrededor: así su nombre
          es «Ver el detalle…» y no todo el texto del documento. */}
      <div className="relative border-b border-border bg-muted/50 p-[18px] transition-colors hover:bg-muted">
        <CertificatePaper certificate={certificate} />
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 rounded-t-[18px]"
          aria-label={`Ver el detalle del certificado de ${certificate.courseTitle}`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-base font-bold leading-snug">{certificate.courseTitle}</h3>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
          <Fact icon={<Calendar />}>{longDate(certificate.completedAt)}</Fact>
          <Fact icon={<Clock />}>{formatHours(certificate.hours)}</Fact>
          {certificate.averageScore !== null && (
            <Fact icon={<Star />}>Nota {formatScoreValue(certificate.averageScore, country)}</Fact>
          )}
          {/* Sólo se menciona la vuelta a partir de la segunda: la primera es lo normal. */}
          {certificate.attempt > 1 && <Fact icon={<RotateCcw />}>{certificate.attempt}.ª vez</Fact>}
        </div>
        {certificate.validUntil && (
          <p
            className={`flex items-center gap-1.5 text-[13px] ${
              certificate.unexpired ? 'text-muted-foreground' : 'font-semibold text-amber-800 dark:text-amber-400'
            }`}
          >
            <ShieldCheck className="h-[15px] w-[15px]" />
            {certificate.unexpired ? 'Válido hasta' : 'Venció el'} {longDate(certificate.validUntil)}
          </p>
        )}

        <CodeRow code={certificate.verificationCode} />

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Descargando…' : 'Descargar PDF'}
          </button>
          <Link
            href={`/verify?code=${encodeURIComponent(certificate.verificationCode)}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <ShieldCheck className="h-4 w-4" /> Comprobar
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * El certificado tal como se ve en papel. El papel es claro también en el modo oscuro: es la
 * imagen del documento, no una tarjeta del campus.
 */
function CertificatePaper({ certificate }: { certificate: Certificate }) {
  const { user } = useSession();
  const { config } = useConfig();
  const { country, name: countryName } = useCountry();
  const holder = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-[1.414] w-full max-w-md flex-col items-center overflow-hidden rounded-xl border border-[hsl(38_22%_84%)] bg-[hsl(40_33%_98%)] px-[8%] py-[7%] text-center text-[hsl(220_25%_14%)] shadow-[inset_0_0_0_6px_hsl(40_33%_98%),inset_0_0_0_7px_hsl(38_22%_84%)]"
    >
      <small className="text-[clamp(6px,1.6vw,10px)] uppercase tracking-[0.18em] text-[hsl(215_14%_40%)]">
        {config?.platformName ?? 'PESV Education'}
        {countryName ? ` · Sede ${countryName}` : ''}
      </small>
      <small className="mt-[4%] text-[clamp(6px,1.6vw,10px)] uppercase tracking-[0.18em] text-[hsl(215_14%_40%)]">
        Certificado de aprobación
      </small>
      <span className="mt-[5%] text-[clamp(12px,3.2vw,20px)] font-extrabold tracking-tight">{holder}</span>
      <span className="mt-[2%] text-[clamp(8px,1.9vw,12px)] text-[hsl(215_14%_35%)]">
        {certificate.averageScore !== null
          ? `aprobó con nota de ${formatScore(certificate.averageScore, country)} el curso`
          : 'aprobó el curso'}
      </span>
      <span className="mt-[2%] line-clamp-2 text-[clamp(10px,2.4vw,15px)] font-bold text-primary dark:text-[hsl(220_25%_20%)]">
        {certificate.courseTitle}
      </span>
      <span className="mt-[2%] text-[clamp(8px,1.9vw,12px)] text-[hsl(215_14%_35%)]">
        {formatHours(certificate.hours)} · {longDate(certificate.completedAt)}
      </span>
      <span className="mt-auto flex flex-col items-center gap-1 text-[clamp(6px,1.4vw,10px)] text-[hsl(215_14%_40%)]">
        <span className="block w-[clamp(70px,22vw,140px)] border-t border-[hsl(215_14%_60%)]" />
        Código {certificate.verificationCode}
      </span>
      <span className="absolute bottom-[9%] right-[7%] grid aspect-square w-[18%] place-items-center rounded-full border-2 border-primary/50 text-primary">
        <ShieldCheck className="h-[46%] w-[46%]" />
      </span>
    </div>
  );
}

/** El código de verificación, a la vista y con un botón para copiarlo. */
function CodeRow({ code }: { code: string }) {
  const { notify } = useAlerts();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Sin permiso para el portapapeles, el código sigue a la vista para copiarlo a mano.
      notify.error('No se pudo copiar', 'Selecciona el código y cópialo a mano.');
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 py-1.5 pl-3.5 pr-1.5 font-mono text-[13px]">
      <span className="min-w-0 flex-1 select-all truncate">{code}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-sans text-[13px] font-semibold text-foreground transition-colors hover:bg-card"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 [&_svg]:h-[15px] [&_svg]:w-[15px]">
      {icon}
      {children}
    </span>
  );
}
