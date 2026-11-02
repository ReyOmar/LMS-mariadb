import { countryName, type Country } from '@/lib/country';

/** Plataforma y sede que emitieron un certificado, tal como las devuelve la verificación. */
export interface CertificateIssuer {
  country: Country;
  platformName: string;
}

/**
 * Quién emitió el certificado: «Emitido por PESV Education · sede México.».
 *
 * La verificación es pública y acepta códigos de las dos sedes, así que siempre nombra la
 * sede.
 */
export function issuedBy(issuer: CertificateIssuer): string {
  return `Emitido por ${issuer.platformName} · sede ${countryName(issuer.country)}.`;
}
