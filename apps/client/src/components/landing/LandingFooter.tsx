import type { ReactNode } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { COUNTRY_INFO, type Country } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { BrandMark } from './BrandMark';

const FOOTER_LINK = 'block hover:text-primary transition-colors';

export function LandingFooter({
  logoUrl,
  platformName,
  description,
  country,
}: {
  logoUrl: string | null;
  platformName: string;
  description: string;
  country: Country;
}) {
  return (
    <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 min-w-0 font-bold text-xl text-primary mb-4">
              <BrandMark logoUrl={logoUrl} />
              <span className="truncate">{platformName}</span>
            </div>
            <p className="text-muted-foreground max-w-sm leading-relaxed">{description}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <CountryFlag country={country} size="sm" /> Sede {COUNTRY_INFO[country].name}
            </p>
          </div>

          <FooterLinks title="Plataforma">
            <a href="#services" className={FOOTER_LINK}>
              Servicios
            </a>
            <a href="#features" className={FOOTER_LINK}>
              Características
            </a>
            <Link href="/login" className={FOOTER_LINK}>
              Iniciar sesión
            </Link>
          </FooterLinks>

          <FooterLinks title="Legal">
            <Link href="/legal#privacy" className={FOOTER_LINK}>
              Política de privacidad
            </Link>
            <Link href="/legal#terms" className={FOOTER_LINK}>
              Términos de uso
            </Link>
            <Link href="/legal#data" className={FOOTER_LINK}>
              Protección de datos
            </Link>
            <Link href="/verify" className={FOOTER_LINK}>
              Verificar certificado
            </Link>
          </FooterLinks>
        </div>

        <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center text-center text-sm text-muted-foreground gap-3">
          <p>
            © {new Date().getFullYear()} {platformName}. Todos los derechos reservados.
          </p>
          <p className="flex items-center gap-1">
            <Shield className="h-4 w-4 text-primary" /> Comprometidos con la seguridad vial
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-base font-bold mb-4">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </nav>
  );
}
