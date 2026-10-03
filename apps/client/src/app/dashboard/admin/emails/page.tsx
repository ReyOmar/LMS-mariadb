'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Power, Edit3, Search, ChevronDown, ChevronRight, Zap, Filter, MailCheck, MailX } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import TemplateEditor, { SubjectWithVariables, VariableLabel } from './components/TemplateEditor';
import { CATEGORIES, eventCategory, groupByCategory } from './components/categories';
import { parseVariables } from './components/preview';
import { plural } from '@/lib/text';

export default function EmailTemplatesPage() {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<{
    event: EmailEvent;
    template: EmailTemplate;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [filteredCategory, setFilteredCategory] = useState<string | null>(null);
  const { showAlert, notify } = useAlerts();

  const loadEvents = useCallback(async () => {
    try {
      const { data } = await api.get<EmailEvent[]>('/email-templates/events');
      setEvents(Array.isArray(data) ? data : []);
    } catch (error) {
      showAlert.error('No se pudieron cargar los eventos de correo', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const onToggleActive = async (templateId: number, wasActive: boolean) => {
    try {
      await api.put(`/email-templates/${templateId}`, { active: !wasActive });
      void loadEvents();
      notify.success(!wasActive ? 'Plantilla activada.' : 'Plantilla desactivada.');
    } catch (error) {
      showAlert.error('No se pudo cambiar el estado de la plantilla', errorMessage(error));
    }
  };

  const onTemplateSave = async (id: number, data: { subject: string; bodyHtml: string }) => {
    setSaving(true);
    try {
      await api.put(`/email-templates/${id}`, data);
      notify.success('Plantilla guardada correctamente.');
      setEditingTemplate(null);
      void loadEvents();
    } catch (error) {
      showAlert.error('No se pudo guardar la plantilla', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Valores calculados ──
  const text = search.toLowerCase();
  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      !text ||
      event.displayName.toLowerCase().includes(text) ||
      event.key.toLowerCase().includes(text) ||
      event.description.toLowerCase().includes(text);

    const matchesCategory = !filteredCategory || eventCategory(event.key).key === filteredCategory;

    return matchesSearch && matchesCategory;
  });

  const eventCount = events.length;
  const templates = events.flatMap((event) => event.templates);
  const activeTemplates = templates.filter((template) => template.active).length;
  const inactiveTemplates = templates.length - activeTemplates;
  const eventsByCategory = groupByCategory(filteredEvents);

  if (editingTemplate) {
    return (
      <div className="h-[calc(100vh-8rem)]">
        <TemplateEditor
          event={editingTemplate.event}
          template={editingTemplate.template}
          onSave={onTemplateSave}
          onCancel={() => setEditingTemplate(null)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700">
      {/* ── Cabecera ── */}
      <header className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              Plantillas de correo
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Administra las notificaciones automáticas que envía la plataforma.
            </p>
          </div>
        </div>
      </header>

      {loading ? (
        <PageLoader message="Cargando configuración de correos..." />
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
          {/* ── Fila de cifras ── */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-black">{eventCount}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Eventos
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <MailCheck className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{activeTemplates}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Activas
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <MailX className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-black text-red-700 dark:text-red-400">{inactiveTemplates}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Inactivas
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Búsqueda y filtro por categoría ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar evento por nombre o identificador"
                placeholder="Buscar evento por nombre o identificador..."
                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                aria-pressed={!filteredCategory}
                onClick={() => setFilteredCategory(null)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                  !filteredCategory
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                }`}
              >
                <Filter className="h-3.5 w-3.5" /> Todos
              </button>
              {CATEGORIES.map((cat) => {
                const CategoryIcon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    aria-pressed={filteredCategory === cat.key}
                    aria-label={cat.label}
                    onClick={() => setFilteredCategory(filteredCategory === cat.key ? null : cat.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                      filteredCategory === cat.key
                        ? `${cat.backgroundColor} ${cat.borderColor} ${cat.color}`
                        : 'bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    <CategoryIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Grupos de eventos ── */}
          {eventsByCategory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-bold text-muted-foreground">No se encontraron eventos</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Intenta con otro término de búsqueda.</p>
            </div>
          ) : (
            eventsByCategory.map((group) => {
              const GroupIcon = group.icon;
              const isCollapsed = collapsedCategories[group.key];

              return (
                <div key={group.key} className="space-y-3">
                  {/* Cabecera de la categoría */}
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleCategory(group.key)}
                    className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition-all hover:shadow-sm ${group.backgroundColor} ${group.borderColor}`}
                  >
                    <div className={`h-9 w-9 rounded-xl ${group.backgroundColor} flex items-center justify-center`}>
                      <GroupIcon className={`h-5 w-5 ${group.color}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <h2 className="font-bold text-sm sm:text-base">
                        {group.label}
                        <span className={`ml-2 text-xs font-medium ${group.color}`}>
                          ({group.eventsWithData.length} {plural(group.eventsWithData.length, 'evento', 'eventos')})
                        </span>
                      </h2>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Eventos de la categoría */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-0 sm:pl-2">
                      {group.eventsWithData.map((event) => {
                        const category = eventCategory(event.key);
                        const variables = parseVariables(event.variables);
                        const hasActiveTemplate = event.templates.some((p) => p.active);

                        return (
                          <div
                            key={event.id}
                            className={`bg-card border rounded-2xl shadow-sm flex flex-col transition-all hover:shadow-md ${
                              hasActiveTemplate ? 'border-border/50' : 'border-red-500/20'
                            }`}
                          >
                            {/* Cabecera del evento */}
                            <div className="p-4 sm:p-5">
                              <div className="flex items-start gap-3 mb-3">
                                <div
                                  className={`h-10 w-10 ${category.backgroundColor} rounded-xl flex items-center justify-center shrink-0`}
                                >
                                  <category.icon className={`h-5 w-5 ${category.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-sm sm:text-base leading-tight">{event.displayName}</h3>
                                  <span
                                    className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${category.backgroundColor} ${category.color}`}
                                  >
                                    <category.icon className="h-2.5 w-2.5" /> {category.label}
                                  </span>
                                </div>
                                {/* Indicador de estado */}
                                <div
                                  className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${
                                    hasActiveTemplate
                                      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                                      : 'bg-red-500 shadow-sm shadow-red-500/50'
                                  }`}
                                  title={hasActiveTemplate ? 'Activo' : 'Inactivo'}
                                />
                              </div>
                              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
                                {event.description}
                              </p>

                              {/* Etiquetas de variables */}
                              <div className="flex flex-wrap gap-1.5">
                                {variables.map((variable) => (
                                  <VariableLabel key={variable} variable={variable} size="sm" />
                                ))}
                              </div>
                            </div>

                            {/* Plantillas */}
                            <div className="border-t border-border/30 p-3 sm:p-4 bg-muted/5 rounded-b-2xl space-y-2">
                              {event.templates.map((template) => (
                                <div
                                  key={template.id}
                                  className="flex items-center justify-between p-2.5 sm:p-3 bg-card border border-border/30 rounded-xl gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-xs sm:text-sm truncate">
                                      <SubjectWithVariables text={template.subject} />
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                                      {template.internalName}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setEditingTemplate({ event, template })}
                                      className="p-2 bg-card hover:bg-muted border border-border/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                      title="Editar plantilla"
                                      aria-label={`Editar plantilla ${template.internalName}`}
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={
                                        template.active
                                          ? `Desactivar envío de ${template.internalName}`
                                          : `Activar envío de ${template.internalName}`
                                      }
                                      onClick={() => onToggleActive(template.id, template.active)}
                                      className={`p-2 border rounded-lg transition-colors flex items-center justify-center ${
                                        template.active
                                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20'
                                          : 'bg-muted border-border/50 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20'
                                      }`}
                                      title={template.active ? 'Desactivar envío' : 'Activar envío'}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {event.templates.length === 0 && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs font-bold text-center">
                                  No hay plantillas para este evento.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
