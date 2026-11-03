'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useSession } from '@/contexts/SessionContext';
import { longDate } from '@/lib/dates';
import { platformNameOf } from '@/lib/platform';
import {
  BASE_LEGAL_DATE,
  BROWSER_STORAGE,
  PRIVACY_TITLE,
  dataControllerFrom,
  defaultLegalTexts,
  missingControllerData,
  parseLegalText,
} from '@/lib/legal';

/**
 * Los textos legales de la sede: la página `/legal` y la ventana de la portada los muestran
 * cada una a su manera, con el mismo contenido.
 */

type WrittenSection = { id: 'terms' | 'privacy' | 'data'; title: string; text: string };
type FixedSection = { id: 'cookies' | 'certificates'; title: string };
type LegalSection = WrittenSection | FixedSection;
export type LegalSectionId = LegalSection['id'];

/** Nivel del título de cada sección: debajo del de la página (`h1`) o del de la ventana (`h2`). */
type SectionLevel = 2 | 3;

/** Lo que dice la sede, con los textos de serie donde no escribió los suyos. */
export function useLegalDocument() {
  const { config } = useConfig();
  const { country, name: countryName } = useCountry();
  const { role } = useSession();
  const platformName = platformNameOf(config);

  const effectiveDate = longDate(config?.legalUpdatedAt ?? BASE_LEGAL_DATE);
  const controller = dataControllerFrom(config, platformName);
  const defaults = defaultLegalTexts(country, platformName, controller, effectiveDate);
  const missing = config && role === 'admin' ? missingControllerData(config, country) : [];

  const sections: LegalSection[] = (
    [
      { id: 'terms', title: 'Términos de uso', text: config?.legalTerms || defaults.terms },
      { id: 'privacy', title: PRIVACY_TITLE[country], text: config?.legalPrivacy || defaults.privacy },
      { id: 'data', title: 'Tus derechos y cómo ejercerlos', text: config?.legalData || defaults.rights },
      { id: 'cookies', title: 'Cookies y almacenamiento en tu navegador' },
      { id: 'certificates', title: 'Emisión de certificados' },
    ] satisfies LegalSection[]
  ).map((section, index) => ({ ...section, title: `${index + 1}. ${section.title}` }));

  return { platformName, countryName, effectiveDate, missing, sections };
}

/** La sede a la que corresponden los textos y, sólo para la administración, lo que falta publicar. */
export function LegalNotes({ countryName, missing }: { countryName: string; missing: string[] }) {
  return (
    <>
      <p className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Estos textos corresponden a la sede de <strong className="text-foreground">{countryName}</strong>. Cada sede se
        rige por la normativa de su país y publica sus propias condiciones.
      </p>

      {missing.length > 0 && (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>
            Sólo lo ven los administradores: falta configurar {listInWords(missing)} del responsable del tratamiento,
            que la ley obliga a publicar. Complétalo en{' '}
            <Link href="/dashboard/admin/landing-settings" className="font-bold underline">
              Portada pública → Textos legales
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}

export function LegalSections({ sections, level }: { sections: LegalSection[]; level: SectionLevel }) {
  const Title = level === 2 ? 'h2' : 'h3';
  const subtitle = level === 2 ? 'h3' : 'h4';

  return sections.map((section) => (
    <section key={section.id} id={section.id} className="mb-12 scroll-mt-24">
      <Title className="text-2xl font-bold mb-4">{section.title}</Title>
      {'text' in section && <LegalText text={section.text} subtitle={subtitle} />}
      {section.id === 'cookies' && <BrowserStorage subtitle={subtitle} />}
      {section.id === 'certificates' && <Certificates />}
    </section>
  ));
}

/** «a», «a y b», «a, b y c». */
function listInWords(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0];
}

const SUBTITLE_CLASS = 'text-lg font-semibold text-foreground mt-6 mb-2';

/** Pinta un texto legal con sus subtítulos y listas; un texto sin marcas se ve como párrafos. */
function LegalText({ text, subtitle: Subtitle }: { text: string; subtitle: 'h3' | 'h4' }) {
  return parseLegalText(text).map((block, index) => {
    if (block.kind === 'heading') {
      return (
        <Subtitle key={index} className={SUBTITLE_CLASS}>
          {block.text}
        </Subtitle>
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
  });
}

function BrowserStorage({ subtitle: Subtitle }: { subtitle: 'h3' | 'h4' }) {
  return (
    <>
      <p className="text-muted-foreground leading-relaxed mb-4">
        El campus no usa cookies publicitarias, analíticas ni de seguimiento, y no comparte con nadie lo que guarda en
        tu navegador. Para funcionar, guarda unos pocos datos en el almacenamiento local de tu navegador, una tecnología
        parecida a las cookies que se queda en tu dispositivo:
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
        Como todo esto es necesario para que el campus funcione, no se puede desactivar por separado. Puedes borrarlo
        cuando quieras desde la configuración de tu navegador, en la opción para borrar las cookies y los datos de los
        sitios: se cerrará tu sesión y el campus volverá a la sede y al aspecto de partida. Si usas la navegación
        privada, se borra solo al cerrar la ventana.
      </p>
      <Subtitle className={SUBTITLE_CLASS}>Contenidos de otros sitios</Subtitle>
      <p className="text-muted-foreground leading-relaxed">
        Algunos cursos incluyen vídeos de YouTube. Al mostrarlos se descarga su imagen de vista previa desde YouTube y,
        cuando los reproduces, YouTube (Google) puede usar sus propias cookies y tecnologías similares según su política
        de privacidad, que no controlamos. Los enlaces a otros sitios se abren en una pestaña nueva y se rigen por sus
        propias políticas. Las tipografías se sirven desde este mismo sitio, sin contactar con servicios de terceros.
      </p>
    </>
  );
}

function Certificates() {
  return (
    <>
      <p className="text-muted-foreground leading-relaxed mb-3">
        Los certificados se emiten cuando cumples los requisitos del curso y llevan un código de verificación único.
        Cualquiera puede comprobar su autenticidad en{' '}
        <Link href="/verify" className="font-bold text-primary hover:underline">
          la página de verificación
        </Link>
        , que muestra sólo lo necesario para confirmar el documento. Falsificar o alterar un certificado está prohibido
        y puede tener consecuencias legales.
      </p>
      <p className="text-muted-foreground leading-relaxed">
        Al emitirse el certificado de un curso se borran del servidor los archivos que entregaste en él. Tus
        calificaciones y el registro de cada entrega se conservan, y el PDF del certificado queda guardado para que
        puedas descargarlo cuando quieras. Si vuelves a cursar el programa, empiezas de cero y, al terminarlo, recibes
        un certificado nuevo.
      </p>
    </>
  );
}
