import { Shield } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PRIVACY_TITLE } from '@/lib/legal';
import type { Country } from '@/lib/country';
import type { LegalSectionId } from '@/components/legal/LegalDocument';
import { BrandMark } from './BrandMark';
import { WindowLink } from './WindowLink';

const LEGAL_LINKS: { section: LegalSectionId; label: (country: Country) => string }[] = [
  { section: 'terms', label: () => 'Términos de uso' },
  { section: 'privacy', label: (country) => PRIVACY_TITLE[country] },
  { section: 'data', label: () => 'Tus derechos' },
  { section: 'cookies', label: () => 'Cookies y almacenamiento' },
];

export function LandingFooter({
  logoUrl,
  platformName,
  description,
  country,
  onSignIn,
  onLegal,
}: {
  logoUrl: string | null;
  platformName: string;
  description: string;
  country: Country;
  onSignIn: () => void;
  /** Abre los textos legales en su sección. */
  onLegal: (section: LegalSectionId) => void;
}) {
  return (
    <footer className="site-footer">
      <div>
        <p className="brand">
          <BrandMark logoUrl={logoUrl} />
          <span>{platformName}</span>
        </p>
        <p className="footer-text">{description}</p>
      </div>

      <nav className="footer-links" aria-labelledby="pie-plataforma">
        <h2 id="pie-plataforma">Plataforma</h2>
        <ul>
          <li>
            <a href="#servicios">Funciones</a>
          </li>
          <li>
            <a href="#ruta">Cómo funciona</a>
          </li>
          <li>
            <WindowLink href="/login" onOpen={onSignIn}>
              Iniciar sesión
            </WindowLink>
          </li>
          <li>
            <a href="#verificar">Verificar certificado</a>
          </li>
        </ul>
      </nav>

      <nav className="footer-links" aria-labelledby="pie-legal">
        <h2 id="pie-legal">Legal</h2>
        <ul>
          {LEGAL_LINKS.map((link) => (
            <li key={link.section}>
              <WindowLink href={`/legal#${link.section}`} onOpen={() => onLegal(link.section)}>
                {link.label(country)}
              </WindowLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {platformName}. Todos los derechos reservados.
        </span>
        <span className="commitment">
          <Shield className="i" />
          Comprometidos con la seguridad vial
        </span>
        <ThemeToggle />
      </div>
    </footer>
  );
}
