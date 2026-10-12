'use client';

import { Award } from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { UnsavedChangesBar } from '@/components/ui/UnsavedChangesBar';
import { useCertificateSettings } from './useCertificateSettings';
import { LegalTextSettings, TitleSettings } from './components/TextSettings';
import { ValiditySettings } from './components/ValiditySettings';
import { VisibleElements } from './components/VisibleElements';
import { PreviewSettings } from './components/PreviewSettings';

export default function CertificateSettingsPage() {
  const { config } = useConfig();
  const { draft, edit, save, hasChanges, saving, loadError, retry } = useCertificateSettings();

  if (loadError) return <LoadFailed message={loadError} onRetry={() => void retry()} />;
  if (!draft || !config) return <PageLoader message="Cargando configuración de certificados…" />;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-28 animate-in fade-in duration-300">
      <header>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Award className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Certificados
        </h1>
        <p className="text-muted-foreground mt-1">Personaliza el diseño y contenido global de los certificados PDF.</p>
      </header>

      <TitleSettings settings={draft} onChange={edit} />
      <ValiditySettings months={draft.certValidityMonths} onChange={(months) => edit({ certValidityMonths: months })} />
      <LegalTextSettings settings={draft} onChange={edit} />
      <VisibleElements settings={draft} onChange={edit} />
      <PreviewSettings settings={draft} brand={config} />

      {hasChanges && <UnsavedChangesBar saving={saving} onSave={() => void save()} />}
    </div>
  );
}
