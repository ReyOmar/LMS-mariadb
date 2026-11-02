'use client';

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import type { CertificateIssuer } from './issuer';

/** Lo justo para confirmar el documento que se tiene delante, sin datos de contacto ni historial de nadie. */
export interface VerifiedCertificate {
  /** Nombre del titular tal como figura en el diploma. */
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
  /** Plataforma y sede que lo emitieron; puede ser la otra sede. */
  issuer: CertificateIssuer;
}

type VerifyResponse = { valid: true; certificate: VerifiedCertificate } | { valid: false; message: string };

export type Verdict = { status: 'valid'; certificate: VerifiedCertificate } | { status: 'invalid'; message: string };

/** La verificación pública de un certificado por su código: no pide sesión. */
export function useCertificateVerification() {
  const [code, setCode] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const form = useRateLimitedForm();
  const { submit } = form;

  const verify = useCallback(
    (codeToCheck: string) => {
      const cleaned = codeToCheck.trim();
      if (!cleaned) return;
      void submit(async () => {
        setVerdict(null);
        const { data } = await api.get<VerifyResponse>(`/certificates/verify/${encodeURIComponent(cleaned)}`);
        setVerdict(
          data.valid
            ? { status: 'valid', certificate: data.certificate }
            : { status: 'invalid', message: data.message },
        );
      }, 'No se pudo comprobar el certificado.');
    },
    [submit],
  );

  return { code, setCode, verdict, form, verify };
}

export type CertificateVerification = ReturnType<typeof useCertificateVerification>;
