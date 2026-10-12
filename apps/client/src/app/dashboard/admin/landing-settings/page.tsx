'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import type { CountrySettings } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { UnsavedChangesBar } from '@/components/ui/UnsavedChangesBar';
import { useCountrySettingsDraft } from '../useCountrySettingsDraft';
import { LANDING_TABS, type TabId } from './landing-fields';
import { LandingField } from './components/LandingField';
import { LegalVersionHistory } from './components/LegalVersionHistory';

export default function LandingSettingsPage() {
  const { name: countryName } = useCountry();
  const { draft, edit, save, hasChanges, saving } = useCountrySettingsDraft();
  const [activeTab, setActiveTab] = useState<TabId>(LANDING_TABS[0].id);

  if (!draft) return <PageLoader message="Cargando configuración…" />;

  const tab = LANDING_TABS.find((item) => item.id === activeTab) ?? LANDING_TABS[0];

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
        {LANDING_TABS.map((item) => {
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
          <LandingField
            key={String(definition.field)}
            definition={definition}
            value={(draft[definition.field] as string | null) ?? ''}
            onChange={(value) => edit({ [definition.field]: value } as Partial<CountrySettings>)}
          />
        ))}

        {tab.id === 'legal' && <LegalVersionHistory fields={tab.fields} />}
      </section>

      {hasChanges && <UnsavedChangesBar saving={saving} onSave={() => void save()} />}
    </div>
  );
}
