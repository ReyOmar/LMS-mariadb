'use client';

import { useEffect, useState } from 'react';
import {
  Mail,
  ShieldAlert,
  Power,
  Edit3,
  Search,
  GraduationCap,
  Shield,
  Settings,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Activity,
  Zap,
  Filter,
  MailCheck,
  MailX,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import api from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import MailTemplateEditor, { SubjectWithPills, VariablePill } from './components/MailTemplateEditor';

interface Plantilla {
  id: number;
  nombre_interno: string;
  asunto: string;
  cuerpo_html: string;
  activo: boolean;
  es_sistema: boolean;
}

interface Evento {
  id: number;
  identificador: string;
  nombre_legible: string;
  descripcion: string;
  variables: string;
  plantillas: Plantilla[];
}

// ── Category Configuration ──
const CATEGORIES: {
  key: string;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  events: string[];
}[] = [
  {
    key: 'estudiantes',
    label: 'Estudiantes',
    icon: GraduationCap,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    events: [
      'CALIFICACION_RECIBIDA',
      'RECORDATORIO_INACTIVIDAD',
      'MODULO_REINICIADO',
      'MATRICULA_NUEVA',
      'CERTIFICADO_GENERADO',
      'ENTREGA_RECHAZADA',
    ],
  },
  {
    key: 'examinadores',
    label: 'Examinadores',
    icon: UserCheck,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    events: ['NUEVA_ENTREGA', 'CURSO_COMPLETADO'],
  },
  {
    key: 'administracion',
    label: 'Administración',
    icon: Shield,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    events: ['NUEVA_SOLICITUD_ACCESO', 'USUARIO_APROBADO'],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: Settings,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    events: ['RECUPERAR_PASSWORD', 'CURSO_MANTENIMIENTO', 'CURSO_REACTIVADO'],
  },
];

function getCategoryForEvent(identificador: string) {
  return CATEGORIES.find((c) => c.events.includes(identificador)) || CATEGORIES[3];
}

export default function BaseCorreos() {
  const { rolReal } = useRole();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlantilla, setEditingPlantilla] = useState<{ evento: Evento; plantilla: Plantilla } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const { showAlert, showToast } = useAlert();

  useEffect(() => {
    if (rolReal === 'admin') {
      fetchEventos();
    }
  }, [rolReal]);

  const fetchEventos = async () => {
    try {
      const res = await api.get('/mail-templates/eventos');
      setEventos(res.data);
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'No se pudieron cargar los eventos de correo.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActivo = async (plantillaId: number, currentStatus: boolean) => {
    try {
      await api.put(`/mail-templates/${plantillaId}`, { activo: !currentStatus });
      fetchEventos();
      showToast.success(!currentStatus ? 'Plantilla activada.' : 'Plantilla desactivada.');
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'No se pudo cambiar el estado de la plantilla.');
    }
  };

  const handleSaveTemplate = async (id: number, data: { asunto: string; cuerpo_html: string }) => {
    setIsSaving(true);
    try {
      await api.put(`/mail-templates/${id}`, data);
      showToast.success('Plantilla guardada correctamente.');
      setEditingPlantilla(null);
      fetchEventos();
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'No se pudo guardar la plantilla.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Computed values ──
  const filteredEventos = eventos.filter((e) => {
    const matchesSearch =
      !search ||
      e.nombre_legible.toLowerCase().includes(search.toLowerCase()) ||
      e.identificador.toLowerCase().includes(search.toLowerCase()) ||
      e.descripcion.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = !filterCategory || getCategoryForEvent(e.identificador).key === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const totalEvents = eventos.length;
  const activeTemplates = eventos.reduce((acc, e) => acc + e.plantillas.filter((p) => p.activo).length, 0);
  const inactiveTemplates = eventos.reduce((acc, e) => acc + e.plantillas.filter((p) => !p.activo).length, 0);

  // Group filtered events by category
  const groupedEvents = CATEGORIES.map((cat) => ({
    ...cat,
    events_data: filteredEventos.filter((e) => cat.events.includes(e.identificador)),
  })).filter((g) => g.events_data.length > 0);

  if (rolReal !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] animate-in fade-in">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Acceso Restringido</h1>
        <p className="text-muted-foreground mt-2">Área exclusiva para Administradores de Sistema.</p>
        <Link
          href="/dashboard"
          className="mt-6 px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors"
        >
          Volver al Tablero
        </Link>
      </div>
    );
  }

  if (editingPlantilla) {
    return (
      <div className="h-[calc(100vh-8rem)]">
        <MailTemplateEditor
          evento={editingPlantilla.evento}
          plantilla={editingPlantilla.plantilla}
          onSave={handleSaveTemplate}
          onCancel={() => setEditingPlantilla(null)}
          isSaving={isSaving}
        />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700">
      {/* ── Header ── */}
      <header className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              Gestión de Correos
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
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-black">{totalEvents}</p>
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
                  <p className="text-2xl font-black text-emerald-600">{activeTemplates}</p>
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
                  <p className="text-2xl font-black text-red-500">{inactiveTemplates}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Inactivas
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-black">{CATEGORIES.length}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Categorías
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Search + Category Filter ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar evento por nombre o identificador..."
                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterCategory(null)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                  !filterCategory
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                }`}
              >
                <Filter className="h-3.5 w-3.5" /> Todos
              </button>
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setFilterCategory(filterCategory === cat.key ? null : cat.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                      filterCategory === cat.key
                        ? `${cat.bgColor} ${cat.borderColor} ${cat.color}`
                        : 'bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    <CatIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Event Groups ── */}
          {groupedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-bold text-muted-foreground">No se encontraron eventos</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Intenta con otro término de búsqueda.</p>
            </div>
          ) : (
            groupedEvents.map((group) => {
              const GroupIcon = group.icon;
              const isCollapsed = collapsedCategories[group.key];

              return (
                <div key={group.key} className="space-y-3">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(group.key)}
                    className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition-all hover:shadow-sm ${group.bgColor} ${group.borderColor}`}
                  >
                    <div className={`h-9 w-9 rounded-xl ${group.bgColor} flex items-center justify-center`}>
                      <GroupIcon className={`h-5 w-5 ${group.color}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <h2 className="font-bold text-sm sm:text-base">
                        {group.label}
                        <span className={`ml-2 text-xs font-medium ${group.color}`}>
                          ({group.events_data.length} evento{group.events_data.length !== 1 ? 's' : ''})
                        </span>
                      </h2>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Events in Category */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-0 sm:pl-2">
                      {group.events_data.map((evento) => {
                        const category = getCategoryForEvent(evento.identificador);
                        const variablesArray: string[] = JSON.parse(evento.variables || '[]');
                        const hasActiveTemplate = evento.plantillas.some((p) => p.activo);

                        return (
                          <div
                            key={evento.id}
                            className={`bg-card border rounded-2xl shadow-sm flex flex-col transition-all hover:shadow-md ${
                              hasActiveTemplate ? 'border-border/50' : 'border-red-500/20'
                            }`}
                          >
                            {/* Event Header */}
                            <div className="p-4 sm:p-5">
                              <div className="flex items-start gap-3 mb-3">
                                <div
                                  className={`h-10 w-10 ${category.bgColor} rounded-xl flex items-center justify-center shrink-0`}
                                >
                                  <category.icon className={`h-5 w-5 ${category.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-sm sm:text-base leading-tight">
                                    {evento.nombre_legible}
                                  </h3>
                                  <span
                                    className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${category.bgColor} ${category.color}`}
                                  >
                                    <category.icon className="h-2.5 w-2.5" /> {category.label}
                                  </span>
                                </div>
                                {/* Status indicator */}
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
                                {evento.descripcion}
                              </p>

                              {/* Variables pills */}
                              <div className="flex flex-wrap gap-1.5">
                                {variablesArray.map((v) => (
                                  <VariablePill key={v} variable={v} size="sm" />
                                ))}
                              </div>
                            </div>

                            {/* Templates */}
                            <div className="border-t border-border/30 p-3 sm:p-4 bg-muted/5 rounded-b-2xl space-y-2">
                              {evento.plantillas.map((plantilla) => (
                                <div
                                  key={plantilla.id}
                                  className="flex items-center justify-between p-2.5 sm:p-3 bg-card border border-border/30 rounded-xl gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-xs sm:text-sm truncate">
                                      <SubjectWithPills text={plantilla.asunto} variables={variablesArray} />
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                                      {plantilla.nombre_interno}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => setEditingPlantilla({ evento, plantilla })}
                                      className="p-2 bg-card hover:bg-muted border border-border/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                      title="Editar Plantilla"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleToggleActivo(plantilla.id, plantilla.activo)}
                                      className={`p-2 border rounded-lg transition-colors flex items-center justify-center ${
                                        plantilla.activo
                                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20'
                                          : 'bg-muted border-border/50 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20'
                                      }`}
                                      title={plantilla.activo ? 'Desactivar Envío' : 'Activar Envío'}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {evento.plantillas.length === 0 && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold text-center">
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
