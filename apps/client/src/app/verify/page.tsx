'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { formatScore } from '@/lib/grading';
import { PageLoader } from '@/components/ui/PageLoader';
import { longDate } from '@/lib/dates';
import { plural } from '@/lib/text';

/**
 * Verificación pública de un certificado.
 *
 * Aquí cualquiera —una empresa, un auditor— puede comprobar con el código impreso que un
 * certificado es auténtico, sin necesidad de cuenta.
 *
 * La respuesta es deliberadamente escueta: nombre, curso y fecha. Lo justo para confirmar
 * el documento que se tiene delante, sin exponer datos de contacto ni el historial de nadie.
 */

interface VerifiedCertificate {
  studentName: string;
  course: string;
  issuedAt: string;
  /** Hasta cuándo acredita. Nulo cuando la sede no declara vigencia. */
  validUntil: string | null;
  /** El certificado es auténtico igualmente; esto dice si sigue en plazo. */
  unexpired: boolean;
  hours: number;
  averageScore: number | null;
  verificationCode: string;
}

type VerifyResponse = { valid: true; certificate: VerifiedCertificate } | { valid: false; message: string };

type Result = { status: 'valid'; certificate: VerifiedCertificate } | { status: 'invalid'; message: string };

export default function VerificationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <PageLoader message="Cargando…" />
        </div>
      }
    >
      <Verifier />
    </Suspense>
  );
}

function Verifier() {
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const verify = useCallback(async (codeToCheck: string) => {
    const cleaned = codeToCheck.trim();
    if (!cleaned) return;

    setChecking(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.get<VerifyResponse>(`/certificates/verify/${encodeURIComponent(cleaned)}`);
      setResult(
        data.valid ? { status: 'valid', certificate: data.certificate } : { status: 'invalid', message: data.message },
      );
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo comprobar el certificado.'));
    } finally {
      setChecking(false);
    }
  }, []);

  // Permite enlazar directamente desde un QR o un correo: /verify?code=CERT-...
  useEffect(() => {
    const fromUrl = params?.get('code');
    if (!fromUrl) return;
    setCode(fromUrl);
    void verify(fromUrl);
  }, [params, verify]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <span className="flex items-center gap-2 font-bold text-primary">
            <ShieldCheck className="h-5 w-5" /> Verificación de certificados
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 mb-6">
              <BadgeCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Comprueba un certificado</h1>
            <p className="text-muted-foreground leading-relaxed">
              Introduce el código de verificación que aparece al pie del documento para confirmar que fue emitido por
              este campus.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 mb-10">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CERT-XXXXXXXXXX-XXXXXX"
                aria-label="Código de verificación"
                className="h-13 w-full rounded-2xl border border-border bg-card pl-11 pr-4 py-4 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={checking || !code.trim()}
              className="h-13 rounded-2xl bg-primary px-8 py-4 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {checking ? 'Comprobando…' : 'Verificar'}
            </button>
          </form>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive"
            >
              {error}
            </p>
          )}

          {result?.status === 'invalid' && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
              <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Certificado no encontrado</h2>
              <p className="text-muted-foreground">{result.message}</p>
            </div>
          )}

          {result?.status === 'valid' && (
            <div className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-500/5 p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
                  <ShieldCheck className="h-6 w-6 text-emerald-600" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">Certificado auténtico</h2>
                  <p className="text-sm text-muted-foreground">
                    {result.certificate.unexpired
                      ? 'Emitido por este campus.'
                      : 'Emitido por este campus. Su periodo de vigencia ya terminó.'}
                  </p>
                </div>
              </div>

              <dl className="space-y-4">
                <Field label="Titular" value={result.certificate.studentName} highlighted />
                <Field label="Programa" value={result.certificate.course} highlighted />
                <Field label="Fecha de emisión" value={longDate(result.certificate.issuedAt)} />
                <Field
                  label="Intensidad horaria"
                  value={`${result.certificate.hours} ${plural(result.certificate.hours, 'hora', 'horas')}`}
                />
                {result.certificate.validUntil && (
                  <Field
                    label={result.certificate.unexpired ? 'Válido hasta' : 'Venció el'}
                    value={longDate(result.certificate.validUntil)}
                  />
                )}
                <Field label="Calificación" value={formatScore(result.certificate.averageScore)} />
                <Field label="Código" value={result.certificate.verificationCode} monospace />
              </dl>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
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
