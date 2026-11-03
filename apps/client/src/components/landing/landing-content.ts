import type { CountrySettings } from '@/contexts/ConfigContext';
import type { Country } from '@/lib/country';
import { publicContact } from '@/lib/landing';

type LandingSettings = Partial<
  Pick<
    CountrySettings,
    | 'landingHeroTitle1'
    | 'landingHeroTitle2'
    | 'landingHeroSubtitle'
    | 'landingFooterText'
    | 'landingPhone'
    | 'landingPhoneSub'
    | 'landingEmail'
    | 'landingEmailSub'
    | 'landingOffice'
    | 'landingOfficeSub'
  >
>;

export interface LandingText {
  heroTitle: string;
  /** Segunda línea del titular, destacada con el color primario. */
  heroHighlight: string;
  heroSubtitle: string;
  footer: string;
}

export const DEFAULT_LANDING_TEXT: LandingText = {
  heroTitle: 'Transporte seguro,',
  heroHighlight: 'personal capacitado.',
  heroSubtitle:
    'Capacitación, evaluación y certificación de conductores para el Plan Estratégico de Seguridad Vial de cada empresa.',
  footer: 'Plataforma de capacitación y certificación en seguridad vial para empresas de transporte.',
};

/** Lo que la portada cuenta distinto en cada sede: su normativa y un ejemplo de su sistema PESV. */
interface SiteStory {
  /** La infracción que el sistema PESV de la empresa envía en el ejemplo. */
  infraction: string;
  /** La matrícula que provoca: de la infracción al curso. */
  enrollment: string;
  /** Ciudad del certificado de ejemplo. */
  city: string;
  /** La ley de datos de la sede, en una frase. */
  dataLaw: string;
}

export const SITE_STORIES: Record<Country, SiteStory> = {
  COLOMBIA: {
    infraction: 'Infracción C29',
    enrollment: 'Infracción C29, exceso de velocidad → Manejo defensivo',
    city: 'Bogotá D.C.',
    dataLaw:
      'Autorización de datos según la Ley 1581 de 2012. Si cambian los textos legales, se pide aceptarlos de nuevo.',
  },
  MEXICO: {
    infraction: 'Exceso de velocidad',
    enrollment: 'Exceso de velocidad → Manejo defensivo',
    city: 'Ciudad de México',
    dataLaw: 'Aviso de privacidad según la LFPDPPP. Si cambian los textos legales, se pide aceptarlos de nuevo.',
  },
};

function textOr(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

/** Los textos de la sede; los que dejó vacíos o aún no han llegado, los de serie. */
export function landingText(config: LandingSettings | null): LandingText {
  return {
    heroTitle: textOr(config?.landingHeroTitle1, DEFAULT_LANDING_TEXT.heroTitle),
    heroHighlight: textOr(config?.landingHeroTitle2, DEFAULT_LANDING_TEXT.heroHighlight),
    heroSubtitle: textOr(config?.landingHeroSubtitle, DEFAULT_LANDING_TEXT.heroSubtitle),
    footer: textOr(config?.landingFooterText, DEFAULT_LANDING_TEXT.footer),
  };
}

export type ContactChannel = 'phone' | 'email' | 'office';

export interface PublishedContact {
  channel: ContactChannel;
  value: string;
  /** Horario, plazo de respuesta o dirección; `null` si la sede no lo dio. */
  detail: string | null;
  /** Enlace que abre la llamada o el correo; la oficina no tiene. */
  href: string | null;
}

function contactHref(channel: ContactChannel, value: string): string | null {
  if (channel === 'email') return `mailto:${value}`;
  if (channel === 'phone') return `tel:${value.replace(/[^\d+]/g, '')}`;
  return null;
}

/** Las tarjetas de contacto con datos reales de la sede, en orden fijo; las vacías o de relleno no salen. */
export function publishedContacts(config: LandingSettings | null, country: Country): PublishedContact[] {
  const channels: { channel: ContactChannel; value?: string; detail?: string }[] = [
    { channel: 'phone', value: config?.landingPhone, detail: config?.landingPhoneSub },
    { channel: 'email', value: config?.landingEmail, detail: config?.landingEmailSub },
    { channel: 'office', value: config?.landingOffice, detail: config?.landingOfficeSub },
  ];

  return channels.flatMap(({ channel, value, detail }) => {
    const published = publicContact(value, country);
    if (!published) return [];
    return [
      { channel, value: published, detail: publicContact(detail, country), href: contactHref(channel, published) },
    ];
  });
}
