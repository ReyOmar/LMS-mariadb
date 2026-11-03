import { ShieldCheck, Truck } from 'lucide-react';
import { Phone, placed } from './parts';

/** Un certificado de ejemplo con su sello, y su verificación en un celular. Vista de «Verificar». */
export function CertificateView({
  platformName,
  siteName,
  city,
}: {
  platformName: string;
  siteName: string;
  city: string;
}) {
  return (
    <>
      <div className="cert-doc">
        <div className="cert-top">
          <span className="brand-line">
            <span className="tile">
              <Truck className="i" />
            </span>
            <span>{platformName}</span>
          </span>
          <small>Sede {siteName}</small>
        </div>
        <div className="cert-body">
          <p className="title">Certificado</p>
          <p className="subtitle">De finalización académica</p>
          <p className="muted">Se otorga a</p>
          <p className="name">Juana Ramírez Ortiz</p>
          <p className="muted">por haber completado y aprobado el programa</p>
          <p className="program">Manejo defensivo</p>
          <p className="muted">con una intensidad de 20 horas y una calificación de 94/100.</p>
        </div>
        <div className="cert-foot">
          <p className="place">{city}, 29 de octubre de 2026</p>
          <div>
            <svg viewBox="0 0 120 32">
              <path d="M4 24c8-14 14-18 18-12s-4 14 4 10 12-20 18-14-2 16 6 12 10-14 16-10 6 8 12 6 14-8 22-6" />
            </svg>
            <span className="sign">Carlos Pérez · Examinador</span>
          </div>
          <p className="code">
            <small>Código de verificación</small>
            <br />
            <b>CERT-7C1E94A0B2-MHC4Q1ZK</b>
          </p>
        </div>
        <div className="stamp">
          <ShieldCheck className="i" />
          <span>Auténtico</span>
        </div>
      </div>

      <Phone className="floaty phone-verify" style={placed({ x: '-2%', y: '24%', z: '150px', float: '-2s' })}>
        <div className="phone-body">
          <p className="phone-label">Verificación de certificados</p>
          <p className="phone-input">CERT-7C1E94A0B2-MHC4Q1ZK</p>
          <div className="phone-result">
            <ShieldCheck className="i" />
            <b>Certificado auténtico</b>
            <small>Juana Ramírez Ortiz · Manejo defensivo</small>
          </div>
        </div>
      </Phone>
    </>
  );
}
