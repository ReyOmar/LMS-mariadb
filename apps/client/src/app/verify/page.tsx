'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, ShieldCheck } from 'lucide-react';
import { FullScreenLoader } from '@/components/ui/PageLoader';
import { useCertificateVerification } from '@/components/verification/useCertificateVerification';
import { CertificateCodeForm } from '@/components/verification/CertificateCodeForm';
import { CertificateVerdict } from '@/components/verification/CertificateVerdict';

export default function VerificationPage() {
  return (
    <Suspense fallback={<FullScreenLoader message="Cargando…" />}>
      <Verifier />
    </Suspense>
  );
}

function Verifier() {
  const params = useSearchParams();
  const verification = useCertificateVerification();
  const { setCode, verify } = verification;

  // Permite enlazar directamente desde un QR o un correo: /verify?code=CERT-...
  useEffect(() => {
    const fromUrl = params?.get('code');
    if (!fromUrl) return;
    setCode(fromUrl);
    verify(fromUrl);
  }, [params, setCode, verify]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <span className="hidden sm:flex items-center gap-2 font-bold text-primary">
            <ShieldCheck className="h-5 w-5" /> Verificación de certificados
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 mb-6">
              <BadgeCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Comprueba un certificado</h1>
            <p className="text-muted-foreground leading-relaxed">
              Introduce el código de verificación que aparece al pie del documento para confirmar que es auténtico y qué
              sede lo emitió.
            </p>
          </div>

          <CertificateCodeForm verification={verification} />
          <CertificateVerdict verdict={verification.verdict} />
        </div>
      </main>
    </div>
  );
}
