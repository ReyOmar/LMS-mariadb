'use client';

import { useState } from 'react';
import { FileText, Globe, MapPin, Phone, Save, Type } from 'lucide-react';
import { CountrySettings } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useSettingsDraft } from '@/hooks/useSettingsDraft';
import { PageLoader } from '@/components/ui/PageLoader';
import { LegalVersionHistory } from './components/LegalVersionHistory';

/** Campos editables de la portada, descritos como datos en lugar de repetir el mismo JSX. */
interface EditableField {
  field: keyof CountrySettings;
  label: string;
  hint?: string;
  /** Ejemplo que se ve en el campo vacío. */
  placeholder?: string;
  type?: 'text' | 'area' | 'document';
  limit?: number;
}

type TabId = 'hero' | 'contact' | 'footer' | 'legal';

interface Tab {
  id: TabId;
  title: string;
  icon: typeof Globe;
  description: string;
  fields: EditableField[];
}

const TABS: Tab[] = [
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
      { field: 'landingEmail', label: 'Correo de contacto', placeholder: 'Ej.: contacto@tuempresa.com', limit: 255 },
      { field: 'landingEmailSub', label: 'Tiempo de respuesta', placeholder: 'Ej.: Respuesta en 24 horas', limit: 120 },
      { field: 'landingOffice', label: 'Ciudad', placeholder: 'Ej.: ciudad de la oficina principal', limit: 255 },
      { field: 'landingOfficeSub', label: 'Dirección', placeholder: 'Ej.: calle, número y barrio', limit: 255 },
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
      { field: 'legalAddress', label: 'Domicilio del responsable', limit: 191 },
      {
        field: 'privacyEmail',
        label: 'Correo para ejercer los derechos sobre los datos',
        hint: 'Si se deja vacío se usa el correo de contacto.',
        limit: 191,
      },
      { field: 'legalTerms', label: 'Términos de uso', type: 'document' },
      {
        field: 'legalPrivacy',
        label: 'Política de tratamiento de datos / Aviso de privacidad',
        type: 'document',
      },
      { field: 'legalData', label: 'Derechos de los titulares y cómo ejercerlos', type: 'document' },
    ],
  },
];

export default function LandingSettingsPage() {
  const { name: countryName } = useCountry();
  const { draft, edit, save, hasChanges, saving } = useSettingsDraft();
  const [activeTab, setActiveTab] = useState<TabId>(TABS[0].id);

  if (!draft) return <PageLoader message="Cargando configuración…" />;

  const tab = TABS.find((item) => item.id === activeTab) ?? TABS[0];

  return (
    <div className="max-w-4xl mx-auto pb-28">
      <header className="mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Globe className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Portada pública
        </h1>
        <p className="text-muted-foreground mt-2">
          Contenido de la página de inicio de la sede{countryName ? ` de ${countryName}` : ''}. Los visitantes que
          elijan la otra sede verán textos distintos.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="landing-settings-panel"
              onClick={() => setActiveTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                active
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'bg-card border border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.title}
            </button>
          );
        })}
      </div>

      <section
        id="landing-settings-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab.id}`}
        className="bg-card border border-border/50 rounded-2xl p-5 sm:p-8 shadow-sm space-y-6"
      >
        <p className="text-sm text-muted-foreground">{tab.description}</p>

        {tab.fields.map((definition) => (
          <TextField
            key={String(definition.field)}
            definition={definition}
            value={(draft[definition.field] as string | null) ?? ''}
            onChange={(value) => edit({ [definition.field]: value } as Partial<CountrySettings>)}
          />
        ))}

        {tab.id === 'legal' && <LegalVersionHistory fields={tab.fields} />}
      </section>

      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(calc(100%-2rem),40rem)]">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-2xl">
            <p className="text-sm font-medium">Tienes cambios sin guardar.</p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({
  definition,
  value,
  onChange,
}: {
  definition: EditableField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${String(definition.field)}`;
  const rows = definition.type === 'document' ? 12 : 3;
  const isLong = definition.type === 'area' || definition.type === 'document';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <label htmlFor={id} className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          {definition.label}
        </label>
        {definition.limit && (
          <span
            className={`text-xs tabular-nums ${
              value.length > definition.limit ? 'text-destructive font-bold' : 'text-muted-foreground'
            }`}
          >
            {value.length} / {definition.limit}
          </span>
        )}
      </div>

      {isLong ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={definition.placeholder}
          onChange={(event) => onChange(event.target.value)}
          maxLength={definition.limit}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={definition.placeholder}
          onChange={(event) => onChange(event.target.value)}
          maxLength={definition.limit}
          className="w-full h-11 rounded-xl border border-border bg-background px-4 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      )}

      {definition.hint && <p className="text-xs text-muted-foreground mt-1.5">{definition.hint}</p>}

      {/* El formato que entiende la página legal (`parseLegalText`). */}
      {definition.type === 'document' && (
        <p className="text-xs text-muted-foreground mt-1.5">
          Formato: una línea que empieza por <code className="rounded bg-muted px-1 font-mono">##&nbsp;</code> se
          muestra como subtítulo y las que empiezan por <code className="rounded bg-muted px-1 font-mono">-&nbsp;</code>{' '}
          forman una lista. Deja una línea en blanco entre párrafos.
        </p>
      )}
    </div>
  );
}
