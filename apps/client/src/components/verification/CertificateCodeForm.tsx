'use client';

import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { CertificateVerification } from './useCertificateVerification';

/** El código tal como lo emite el campus: diez cifras hexadecimales y la marca de tiempo. */
const CODE_PLACEHOLDER = 'CERT-XXXXXXXXXX-XXXXXXXX';

export function CertificateCodeForm({ verification }: { verification: CertificateVerification }) {
  const { code, setCode, form, verify } = verification;

  const verifyTyped = (event: FormEvent) => {
    event.preventDefault();
    verify(code);
  };

  return (
    <>
      <form onSubmit={verifyTyped} className="flex flex-col sm:flex-row gap-3 mb-10">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={CODE_PLACEHOLDER}
            aria-label="Código de verificación"
            autoComplete="off"
            spellCheck={false}
            className="h-13 w-full rounded-2xl border border-border bg-card pl-11 pr-4 py-4 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <SubmitButton
          form={form}
          idle="Verificar"
          busy="Comprobando…"
          disabled={!code.trim()}
          className="h-13 w-full sm:w-auto sm:min-w-36"
        />
      </form>

      <FormError message={form.error} />
    </>
  );
}
