'use client';

import { BadgeCheck } from 'lucide-react';
import { useCertificateVerification } from '@/components/verification/useCertificateVerification';
import { CertificateCodeForm } from '@/components/verification/CertificateCodeForm';
import { CertificateVerdict } from '@/components/verification/CertificateVerdict';
import { enterDelay } from './screens';

/** La verificación pública de certificados, la misma de `/verify`, sin salir de la portada. */
export function VerifySection() {
  const verification = useCertificateVerification();

  return (
    <section className="screen" id="verificar" aria-labelledby="t-verificar">
      <div className="wrap">
        <div className="column">
          <div className="verify-intro" data-enter style={enterDelay(0)}>
            <span className="icon-tile">
              <BadgeCheck className="i" />
            </span>
            <h2 className="title" id="t-verificar">
              Comprueba un <span className="text-primary">certificado</span>
            </h2>
            <p className="lead">
              Introduce el código de verificación que aparece al pie del documento para confirmar que es auténtico y qué
              sede lo emitió.
            </p>
          </div>
          <div className="verify-box" data-enter style={enterDelay(1)}>
            <CertificateCodeForm verification={verification} className="mb-0" />
            <p className="verify-help">No hace falta iniciar sesión.</p>
            <CertificateVerdict verdict={verification.verdict} titleLevel={3} />
          </div>
        </div>
      </div>
    </section>
  );
}
