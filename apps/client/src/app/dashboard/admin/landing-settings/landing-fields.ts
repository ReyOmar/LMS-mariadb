import { FileText, MapPin, Phone, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CountrySettings } from '@/contexts/ConfigContext';

/** Tope de cada texto legal: cabe una política extensa, no un pegado accidental de megas. */
const MAX_LEGAL_DOCUMENT_LENGTH = 100_000;

export interface EditableField {
  field: keyof CountrySettings;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'area' | 'document';
  limit?: number;
}

export type TabId = 'hero' | 'contact' | 'footer' | 'legal';

interface LandingTab {
  id: TabId;
  title: string;
  icon: LucideIcon;
  description: string;
  fields: EditableField[];
}

export const LANDING_TABS: LandingTab[] = [
  {
    id: 'hero',
    title: 'Portada',
    icon: Type,
    description: 'Titular y texto de entrada que ve quien llega por primera vez.',
    fields: [
      { field: 'landingHeroTitle1', label: 'Primera línea del titular', limit: 120 },
      {
        field: 'landingHeroTitle2',
        label: 'Segunda línea del titular',
        hint: 'Se muestra destacada con el color primario.',
        limit: 120,
      },
      { field: 'landingHeroSubtitle', label: 'Texto de entrada', type: 'area', limit: 1000 },
    ],
  },
  {
    id: 'contact',
    title: 'Contacto',
    icon: Phone,
    description:
      'Datos de contacto de esta sede. No se comparten con la otra. Si dejas vacío el teléfono, el correo o la ' +
      'ciudad, la portada no muestra esa tarjeta.',
    fields: [
      { field: 'landingPhone', label: 'Teléfono', placeholder: 'Ej.: 601 234 5678', limit: 60 },
      {
        field: 'landingPhoneSub',
        label: 'Horario de atención',
        placeholder: 'Ej.: Lunes a viernes, de 8:00 a 18:00',
        limit: 120,
      },
      { field: 'landingEmail', label: 'Correo de contacto', placeholder: 'Ej.: contacto@tuempresa.com', limit: 191 },
      { field: 'landingEmailSub', label: 'Tiempo de respuesta', placeholder: 'Ej.: Respuesta en 24 horas', limit: 120 },
      { field: 'landingOffice', label: 'Ciudad', placeholder: 'Ej.: ciudad de la oficina principal', limit: 191 },
      { field: 'landingOfficeSub', label: 'Dirección', placeholder: 'Ej.: calle, número y barrio', limit: 191 },
    ],
  },
  {
    id: 'footer',
    title: 'Pie de página',
    icon: MapPin,
    description: 'Descripción breve que acompaña al logotipo en el pie.',
    fields: [{ field: 'landingFooterText', label: 'Texto del pie', type: 'area', limit: 1000 }],
  },
  {
    id: 'legal',
    title: 'Textos legales',
    icon: FileText,
    description:
      'Datos del responsable del tratamiento y textos que se publican en /legal para esta sede. Si dejas un texto ' +
      'vacío se publica el de serie, ya redactado según la normativa del país. Guardar cualquier cambio publica una ' +
      'versión nueva y cada persona deberá aceptarla la próxima vez que entre.',
    fields: [
      { field: 'legalEntityName', label: 'Razón social del responsable', limit: 191 },
      { field: 'legalEntityTaxId', label: 'NIT (Colombia) o RFC (México)', limit: 60 },
      {
        field: 'legalAddress',
        label: 'Domicilio del responsable',
        hint: 'Si se deja vacío se usa la ciudad de contacto.',
        limit: 191,
      },
      {
        field: 'privacyEmail',
        label: 'Correo para ejercer los derechos sobre los datos',
        hint: 'Si se deja vacío se usa el correo de contacto.',
        limit: 191,
      },
      { field: 'legalTerms', label: 'Términos de uso', type: 'document', limit: MAX_LEGAL_DOCUMENT_LENGTH },
      {
        field: 'legalPrivacy',
        label: 'Política de tratamiento de datos / Aviso de privacidad',
        type: 'document',
        limit: MAX_LEGAL_DOCUMENT_LENGTH,
      },
      {
        field: 'legalData',
        label: 'Derechos de los titulares y cómo ejercerlos',
        type: 'document',
        limit: MAX_LEGAL_DOCUMENT_LENGTH,
      },
    ],
  },
];
