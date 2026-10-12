'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import type { TemplateContent } from './components/useTemplateEditor';

function withTemplate(events: EmailEvent[], updated: EmailTemplate): EmailEvent[] {
  return events.map((event) => ({
    ...event,
    templates: event.templates.map((template) => (template.id === updated.id ? { ...template, ...updated } : template)),
  }));
}

export function useEmailTemplates() {
  const { showAlert, notify } = useAlerts();
  const [events, setEvents] = useState<EmailEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggling = useInFlight<number>();

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<EmailEvent[]>('/email-templates/events');
      setEvents(Array.isArray(data) ? data : []);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudieron cargar los eventos de correo.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (id: number, changes: Partial<EmailTemplate>) => {
    const { data } = await api.put<EmailTemplate>(`/email-templates/${id}`, changes);
    setEvents((current) => current && withTemplate(current, data));
  };

  const toggleActive = (template: EmailTemplate) =>
    toggling.run(template.id, async () => {
      try {
        await update(template.id, { active: !template.active });
        notify.success(template.active ? 'Plantilla desactivada.' : 'Plantilla activada.');
      } catch (failure) {
        showAlert.error('No se pudo cambiar el estado de la plantilla', errorMessage(failure));
      }
    });

  /** Devuelve si se guardó, para cerrar el editor sólo entonces. */
  const saveTemplate = async (id: number, content: TemplateContent): Promise<boolean> => {
    setSaving(true);
    try {
      await update(id, content);
      notify.success('Plantilla guardada correctamente.');
      return true;
    } catch (failure) {
      showAlert.error('No se pudo guardar la plantilla', errorMessage(failure));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { events, error, retry: load, saving, isToggling: toggling.has, toggleActive, saveTemplate };
}
