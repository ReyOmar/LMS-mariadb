'use client';

import { AlertTriangle, ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useSession } from '@/contexts/SessionContext';
import { longDate } from '@/lib/dates';
import {
  BASE_LEGAL_DATE,
  BROWSER_STORAGE,
  PRIVACY_TITLE,
  dataControllerFrom,
  defaultLegalTexts,
  missingControllerData,
  parseLegalText,
} from '@/lib/legal';

export default function LegalPage() {
  const { config } = useConfig();
  const { country, name: countryName } = useCountry();
  const { role } = useSession();
  const platformName = config?.platformName || 'PESV Education';

  const effectiveDate = longDate(config?.legalUpdatedAt ?? BASE_LEGAL_DATE);
  const controller = dataControllerFrom(config, platformName);
  const defaults = defaultLegalTexts(country, platformName, controller, effectiveDate);
  const missing = config && role === 'admin' ? missingControllerData(config, country) : [];

  const sections = [
    { id: 'terms', title: '1. Términos de uso' },
    { id: 'privacy', title: `2. ${PRIVACY_TITLE[country]}` },
    { id: 'data', title: '3. Tus derechos y cómo ejercerlos' },
    { id: 'cookies', title: '4. Cookies y almacenamiento en tu navegador' },
    { id: 'certificates', title: '5. Emisión de certificados' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-2 font-bold text-primary">
            <Shield className="h-5 w-5" />
            {platformName}
          </div>
        </div>
      </header>

      <main className="flex-1 py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black mb-8">Información legal y privacidad</h1>
          <p className="text-muted-foreground text-lg mb-4">Versión vigente desde el {effectiveDate}</p>
          <p className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Estos textos corresponden a la sede de <strong className="text-foreground">{countryName}</strong>. Cada sede
            se rige por la normativa de su país y publica sus propias condiciones.
          </p>

          {missing.length > 0 && (
            <div
              role="status"
              className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p>
                Sólo lo ven los administradores: falta configurar {listInWords(missing)} del responsable del
                tratamiento, que la ley obliga a publicar. Complétalo en{' '}
                <Link href="/dashboard/admin/landing-settings" className="font-bold underline">
                  Portada pública → Textos legales
                </Link>
                .
              </p>
            </div>
          )}

          <nav aria-label="Contenido" className="mb-12 rounded-xl border border-border px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">En esta página</p>
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-sm text-primary hover:underline">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="terms" title={sections[0].title}>
            <LegalText text={config?.legalTerms || defaults.terms} />
          </Section>
          <Section id="privacy" title={sections[1].title}>
            <LegalText text={config?.legalPrivacy || defaults.privacy} />
          </Section>
          <Section id="data" title={sections[2].title}>
            <LegalText text={config?.legalData || defaults.rights} />
          </Section>

          <Section id="cookies" title={sections[3].title}>
            <p className="text-muted-foreground leading-relaxed mb-4">
              El campus no usa cookies publicitarias, analíticas ni de seguimiento, y no comparte con nadie lo que
              guarda en tu navegador. Para funcionar, guarda unos pocos datos en el almacenamiento local de tu
              navegador, una tecnología parecida a las cookies que se queda en tu dispositivo:
            </p>
            <ul className="space-y-3 mb-4">
              {BROWSER_STORAGE.map((item) => (
                <li key={item.category} className="rounded-xl border border-border px-4 py-3 text-sm">
                  <p className="font-semibold text-foreground">{item.category}</p>
                  <p className="text-muted-foreground leading-relaxed">{item.purpose}</p>
                  <p className="text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Duración:</span> {item.duration}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Como todo esto es necesario para que el campus funcione, no se puede desactivar por separado. Puedes
              borrarlo cuando quieras desde la configuración de tu navegador, en la opción para borrar las cookies y los
              datos de los sitios: se cerrará tu sesión y el campus volverá a la sede y al aspecto de partida. Si usas
              la navegación privada, se borra solo al cerrar la ventana.
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Contenidos de otros sitios</h3>
            <p className="text-muted-foreground leading-relaxed">
              Algunos cursos incluyen vídeos de YouTube. Al mostrarlos se descarga su imagen de vista previa desde
              YouTube y, cuando los reproduces, YouTube (Google) puede usar sus propias cookies y tecnologías similares
              según su política de privacidad, que no controlamos. Los enlaces a otros sitios se abren en una pestaña
              nueva y se rigen por sus propias políticas. Las tipografías se sirven desde este mismo sitio, sin
              contactar con servicios de terceros.
            </p>
          </Section>

          <Section id="certificates" title={sections[4].title}>
            <p className="text-muted-foreground leading-relaxed">
              Los certificados se emiten cuando cumples los requisitos del curso y llevan un código de verificación
              único. Cualquiera puede comprobar su autenticidad en{' '}
              <Link href="/verify" className="font-bold text-primary hover:underline">
                la página de verificación
              </Link>
              , que muestra sólo lo necesario para confirmar el documento. Falsificar o alterar un certificado está
              prohibido y puede tener consecuencias legales.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground bg-card/20">
        <p>
          © {new Date().getFullYear()} {platformName}. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}

/** «a», «a y b», «a, b y c». */
function listInWords(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0];
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {children}
    </section>
  );
}

/** Pinta un texto legal con sus subtítulos y listas; un texto sin marcas se ve como párrafos. */
function LegalText({ text }: { text: string }) {
  return (
    <>
      {parseLegalText(text).map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <h3 key={index} className="text-lg font-semibold text-foreground mt-6 mb-2">
              {block.text}
            </h3>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1.5 mb-3 text-muted-foreground leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-muted-foreground leading-relaxed whitespace-pre-line mb-3">
            {block.text}
          </p>
        );
      })}
    </>
  );
}
