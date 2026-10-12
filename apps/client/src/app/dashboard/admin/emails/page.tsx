'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { useCountry } from '@/contexts/CountryContext';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import { TemplateEditor } from './components/TemplateEditor';
import { EmailStats } from './components/EmailStats';
import { CategoryFilter } from './components/CategoryFilter';
import { CategoryGroup } from './components/CategoryGroup';
import { filterEvents, groupByCategory } from './components/categories';
import { useEmailTemplates } from './useEmailTemplates';

export default function EmailTemplatesPage() {
  const { name: countryName } = useCountry();
  const { events, error, retry, saving, isToggling, toggleActive, saveTemplate } = useEmailTemplates();
  const [editing, setEditing] = useState<{ event: EmailEvent; template: EmailTemplate } | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  if (error && !events) return <LoadFailed message={error} onRetry={() => void retry()} />;
  if (!events) return <PageLoader message="Cargando configuración de correos..." />;

  if (editing) {
    return (
      <div className="h-[calc(100dvh-8rem)]">
        <TemplateEditor
          event={editing.event}
          template={editing.template}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={async (content) => {
            if (await saveTemplate(editing.template.id, content)) setEditing(null);
          }}
        />
      </div>
    );
  }

  const groups = groupByCategory(filterEvents(events, search, category));

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Plantillas de correo
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Administra los correos automáticos de la sede{countryName ? ` de ${countryName}` : ''}. Cada sede tiene sus
          propias plantillas: lo que cambies aquí no afecta a la otra.
        </p>
      </header>

      <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
        <EmailStats events={events} />

        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            className="flex-1"
            value={search}
            onChange={setSearch}
            label="Buscar evento por nombre o identificador"
          />
          <CategoryFilter value={category} onChange={setCategory} />
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-10 w-10" />}
            title="No se encontraron eventos"
            description={
              events.length === 0
                ? 'Esta sede aún no tiene eventos de correo.'
                : 'Ningún evento casa con la búsqueda y la categoría elegidas.'
            }
          />
        ) : (
          groups.map(({ eventsWithData, ...group }) => (
            <CategoryGroup
              key={group.key}
              category={group}
              events={eventsWithData}
              isToggling={isToggling}
              onEdit={(event, template) => setEditing({ event, template })}
              onToggleActive={(template) => void toggleActive(template)}
            />
          ))
        )}
      </div>
    </div>
  );
}
