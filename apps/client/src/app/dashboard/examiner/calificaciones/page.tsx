'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookCheck,
  Download,
  Loader2,
  Check,
  Search,
  FileText,
  Star,
  MessageSquare,
  X,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  PieChart as PieChartIcon,
  Edit3,
} from 'lucide-react';
import dynamic from 'next/dynamic';
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const RechartsTooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });
import { PageLoader } from '@/components/ui/PageLoader';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import api, { mensajeDeError, urlDeArchivo, urlDeMarca } from '@/lib/api';
import { NOTA_APROBACION_DEFECTO, NOTA_MAXIMA, NOTA_MINIMA, formatearPuntos } from '@/lib/calificacion';
import { useAlert } from '@/contexts/AlertContext';
import { useDebounce } from '@/hooks/usePerformance';

export default function CalificacionManualPage() {
  const { user } = useRole();
  const [entregas, setEntregas] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down state
  const [selectedCourseGuid, setSelectedCourseGuid] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const debouncedCourseSearch = useDebounce(courseSearch, 250);
  const [filter, setFilter] = useState<'all' | 'pending' | 'graded'>('all');

  // Accordion state
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const { showAlert, showToast } = useAlert();

  // Grading state
  const [gradingGuid, setGradingGuid] = useState<string | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [gradeComment, setGradeComment] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * Entregas pendientes de calificar y cursos del examinador.
   * El servidor ya devuelve sólo las entregas de sus cursos y excluye los cuestionarios,
   * que se corrigen solos.
   */
  const fetchData = useCallback(async () => {
    try {
      const [resEntregas, resCursos] = await Promise.all([
        api.get('/evaluaciones/examinador/entregas'),
        api.get('/cursos'),
      ]);
      setEntregas(Array.isArray(resEntregas.data) ? resEntregas.data : []);
      setCursos(Array.isArray(resCursos.data) ? resCursos.data : []);
    } catch (error) {
      console.error('No se pudieron cargar las entregas', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchData();
  }, [user?.guid, fetchData]);

  useEventoRealtime('submission:new', () => fetchData());
  useEventoRealtime('submission:graded', () => fetchData());

  /**
   * Normaliza lo que el examinador teclea en el campo de nota.
   * Acepta enteros y un decimal dentro de 0–100; cualquier otra cosa no llega a escribirse,
   * de modo que el error se evita en lugar de tener que explicarlo después.
   */
  const handleGradeChange = (val: string) => {
    let limpio = val.replace(/[^0-9.]/g, '');

    const partes = limpio.split('.');
    if (partes.length > 2) limpio = `${partes[0]}.${partes.slice(1).join('')}`;

    if (limpio === '' || limpio === '.') {
      setGradeValue(limpio === '.' ? '0.' : '');
      return;
    }

    const [entera, decimal] = limpio.split('.');
    if (Number(entera) > NOTA_MAXIMA) {
      setGradeValue(String(NOTA_MAXIMA));
      return;
    }
    if (decimal !== undefined && decimal.length > 1) {
      limpio = `${entera}.${decimal.slice(0, 1)}`;
    }

    setGradeValue(limpio);
  };

  const handleCalificar = async (guid: string) => {
    const nota = Number.parseFloat(gradeValue);
    if (!Number.isFinite(nota) || nota < NOTA_MINIMA || nota > NOTA_MAXIMA) {
      showAlert.warning(
        'Calificación no válida',
        `Escribe un número entre ${NOTA_MINIMA} y ${NOTA_MAXIMA}.`,
      );
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/evaluaciones/entregas/${guid}/calificar`, {
        calificacion: nota,
        comentario: gradeComment || undefined,
      });
      setEntregas((prev) =>
        prev.map((e) =>
          e.guid === guid
            ? { ...e, estado: 'CALIFICADA', calificacion: nota, comentario: gradeComment || null }
            : e,
        ),
      );
      setGradingGuid(null);
      setGradeValue('');
      setGradeComment('');
      showToast.success('La nota ha sido guardada y el estudiante notificado.');
    } catch (error) {
      showAlert.error('No se pudo guardar la nota', mensajeDeError(error));
    } finally {
      setSaving(false);
    }
  };

  const cursosAgrupados = useMemo(() => {
    const map = new Map<
      string,
      {
        guid: string;
        titulo: string;
        imagen_portada: string | null;
        total: number;
        pending: number;
        graded: number;
        entregas: any[];
      }
    >();

    // Registrar todos los cursos asignados para que aparezcan aunque no tengan entregas
    cursos.forEach((c) => {
      map.set(c.guid, {
        guid: c.guid,
        titulo: c.titulo,
        imagen_portada: c.imagen_portada,
        total: 0,
        pending: 0,
        graded: 0,
        entregas: [],
      });
    });

    entregas.forEach((e) => {
      if (!map.has(e.curso_guid)) {
        map.set(e.curso_guid, {
          guid: e.curso_guid,
          titulo: e.curso_titulo,
          imagen_portada: null, // Si un estudiante envía de un curso desasignado
          total: 0,
          pending: 0,
          graded: 0,
          entregas: [],
        });
      }
      const curso = map.get(e.curso_guid)!;
      curso.total++;
      if (e.estado === 'CALIFICADA') curso.graded++;
      else curso.pending++;
      curso.entregas.push(e);
    });

    return Array.from(map.values());
  }, [entregas, cursos]);

  // View 2 variables (moved above early returns to obey Hook rules)
  const selectedCourse = cursosAgrupados.find((c) => c.guid === selectedCourseGuid);

  const gradeDistribution = useMemo(() => {
    if (!selectedCourse) return [];

    // Los tramos se describen respecto al umbral de aprobación, no a números sueltos:
    // si el curso cambia su mínimo, la gráfica sigue diciendo algo útil.
    const umbral = NOTA_APROBACION_DEFECTO;
    const ranges = [
      { name: `Por debajo de ${Math.round(umbral * 0.75)}`, count: 0, fill: '#ef4444' },
      { name: `Entre ${Math.round(umbral * 0.75)} y ${umbral - 1}`, count: 0, fill: '#f59e0b' },
      { name: `${umbral} o más (aprobado)`, count: 0, fill: '#10b981' },
    ];

    selectedCourse.entregas.forEach((e) => {
      if (e.estado !== 'CALIFICADA') return;
      const val = e.calificacion;
      if (val === null || val === undefined || Number.isNaN(val)) return;

      if (val >= umbral) ranges[2].count++;
      else if (val >= umbral * 0.75) ranges[1].count++;
      else ranges[0].count++;
    });

    return ranges.filter((r) => r.count > 0);
  }, [selectedCourse]);

  const coursePieData =
    selectedCourse && selectedCourse.total > 0
      ? [
          { name: 'Pendientes', value: selectedCourse.pending, color: '#f59e0b' },
          { name: 'Calificadas', value: selectedCourse.graded, color: '#10b981' },
        ].filter((d) => d.value > 0)
      : [{ name: 'Sin entregas', value: 1, color: '#94a3b8' }];

  const filtered = useMemo(() => {
    return (selectedCourse?.entregas || []).filter((e) => {
      const q = search.toLowerCase();
      const matchesSearch =
        e.estudiante?.nombre?.toLowerCase().includes(q) ||
        e.estudiante?.apellido?.toLowerCase().includes(q) ||
        e.tarea_titulo?.toLowerCase().includes(q);

      if (filter === 'pending') return matchesSearch && e.estado !== 'CALIFICADA';
      if (filter === 'graded') return matchesSearch && e.estado === 'CALIFICADA';
      return matchesSearch;
    });
  }, [selectedCourse, search, filter]);

  const entregasAgrupadas = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    filtered.forEach((e) => {
      const modTitle = e.modulo_titulo || 'Módulo Principal';
      const taskTitle = e.tarea_titulo || 'Sin título';
      if (!groups[modTitle]) groups[modTitle] = {};
      if (!groups[modTitle][taskTitle]) groups[modTitle][taskTitle] = [];
      groups[modTitle][taskTitle].push(e);
    });

    return Object.entries(groups).map(([modulo_titulo, tareasMap]) => {
      let modPendingCount = 0;
      let modGradedCount = 0;

      const tareas = Object.entries(tareasMap).map(([tarea_titulo, entregas]) => {
        const pendingCount = entregas.filter((e) => e.estado !== 'CALIFICADA').length;
        const gradedCount = entregas.length - pendingCount;
        modPendingCount += pendingCount;
        modGradedCount += gradedCount;

        return {
          tarea_titulo,
          entregas,
          pendingCount,
          gradedCount,
        };
      });

      return {
        modulo_titulo,
        tareas,
        pendingCount: modPendingCount,
        gradedCount: modGradedCount,
      };
    });
  }, [filtered]);

  if (!selectedCourseGuid && !loading) {
    if (cursosAgrupados.length === 0) {
      return (
        <div className="animate-in fade-in duration-700">
          <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <BookCheck className="h-8 w-8 text-primary" />
              Calificación Manual
            </h1>
            <p className="text-muted-foreground mt-2">
              Selecciona un curso para ver y calificar las entregas de los estudiantes.
            </p>
          </header>
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <BookCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">No hay cursos asignados</h3>
            <p className="text-muted-foreground text-sm mt-1">Actualmente no tienes cursos asignados para calificar.</p>
          </div>
        </div>
      );
    }

    const filteredCursos = cursosAgrupados.filter((c) =>
      c.titulo.toLowerCase().includes(debouncedCourseSearch.toLowerCase()),
    );

    const totalEntregasGlobal = entregas.length;
    const totalPendingGlobal = entregas.filter((e) => e.estado !== 'CALIFICADA').length;
    const totalGradedGlobal = totalEntregasGlobal - totalPendingGlobal;

    const globalPieData =
      totalEntregasGlobal > 0
        ? [
            { name: 'Pendientes', value: totalPendingGlobal, color: '#f59e0b' },
            { name: 'Calificadas', value: totalGradedGlobal, color: '#10b981' },
          ].filter((d) => d.value > 0)
        : [{ name: 'Sin entregas', value: 1, color: '#94a3b8' }];

    const courseBarData = cursosAgrupados
      .filter((c) => c.total > 0)
      .map((c) => ({
        name: c.titulo.length > 15 ? c.titulo.substring(0, 15) + '...' : c.titulo,
        Pendientes: c.pending,
        Calificadas: c.graded,
        guid: c.guid,
      }));

    return (
      <div className="animate-in fade-in duration-700">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <BookCheck className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Calificación Manual
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Selecciona un curso para ver y calificar las entregas de los estudiantes.
          </p>
        </header>

        {/* Global Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-bold">{totalEntregasGlobal}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Total Entregas</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Star className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-2xl font-bold">{totalPendingGlobal}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Pendientes Globales</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-bold">{totalGradedGlobal}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Calificadas Globales</p>
          </div>
        </div>

        {/* Global Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Estado Global de Entregas
            </h3>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={globalPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="var(--card)"
                    strokeWidth={4}
                    cornerRadius={4}
                  >
                    {globalPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: 'none' }} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    cursor={{ fill: 'currentColor', opacity: 0.05 }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '13px', fontWeight: '500', paddingLeft: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              Cursos con más actividad
            </h3>
            <div className="h-[180px] w-full">
              {courseBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={courseBarData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onClick={(state: any) => {
                      if (state && state?.activePayload && state.activePayload.length > 0) {
                        setSelectedCourseGuid(state.activePayload[0].payload.guid);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="currentColor"
                      className="text-border/40"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'currentColor', fontSize: 12, fontWeight: 600 }}
                      className="text-muted-foreground"
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'currentColor', opacity: 0.05 }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="Pendientes" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={60} />
                    <Bar dataKey="Calificadas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No hay entregas en los cursos asignados.
                </div>
              )}
            </div>
          </div>
        </div>

        {cursosAgrupados.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Buscar curso asignado por nombre..."
                className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
              />
              {courseSearch && (
                <button
                  onClick={() => setCourseSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {filteredCursos.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <BookCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Sin cursos para mostrar</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No se encontraron cursos que coincidan con la búsqueda, o no tienes cursos asignados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredCursos.map((curso, idx) => {
              return (
                <div
                  key={curso.guid || `curso-${idx}`}
                  className="bg-card border border-border/50 hover:border-primary/50 hover:shadow-md transition-all rounded-2xl p-6 flex flex-col h-full relative"
                >
                  {/* Make the title area clickable to go to details */}
                  <div className="cursor-pointer group flex-1" onClick={() => setSelectedCourseGuid(curso.guid)}>
                    <h3 className="font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2 pr-8">
                      {curso.titulo}
                    </h3>
                  </div>

                  {/* Arrow icon that goes to course grading */}
                  <button
                    onClick={() => setSelectedCourseGuid(curso.guid)}
                    className="absolute top-6 right-6 p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-colors"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-4 mt-auto">
                    <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden relative group/cover bg-muted flex items-center justify-center border border-border">
                      {curso.imagen_portada ? (
                        <img
                          src={urlDeMarca(curso.imagen_portada) ?? ''}
                          alt="Portada"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2 cursor-pointer" onClick={() => setSelectedCourseGuid(curso.guid)}>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pendientes</span>
                        <span className="font-bold text-amber-500">{curso.pending}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Calificadas</span>
                        <span className="font-bold text-emerald-500">{curso.graded}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${curso.total > 0 ? (curso.graded / curso.total) * 100 : 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground w-10 text-right">
                          {curso.total > 0 ? Math.round((curso.graded / curso.total) * 100) : 100}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 2: Detailed Course Grading

  if (loading) {
    return <PageLoader message="Cargando entregas para calificar..." />;
  }

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <button
        onClick={() => {
          setSelectedCourseGuid(null);
          setSearch('');
          setFilter('all');
          setGradingGuid(null);
        }}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a cursos
      </button>

      <header className="mb-8">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <BookCheck className="h-6 w-6 text-primary" />
          {selectedCourse?.titulo}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-bold">{selectedCourse?.total}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Total Entregas</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Star className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-2xl font-bold">{selectedCourse?.pending}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Pendientes por Calificar</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-bold">{selectedCourse?.graded}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Calificadas</p>
          </div>
        </div>
      </header>

      {/* Course Specific Charts */}
      {selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Progreso de Calificación
            </h3>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={coursePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="var(--card)"
                    strokeWidth={4}
                    cornerRadius={4}
                  >
                    {coursePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: 'none' }} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    cursor={{ fill: 'currentColor', opacity: 0.05 }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '13px', fontWeight: '500', paddingLeft: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              Distribución de Notas (Calificadas)
            </h3>
            <div className="h-[180px] w-full">
              {gradeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeDistribution} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="currentColor"
                      className="text-border/40"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'currentColor', fontSize: 12, fontWeight: 600 }}
                      className="text-muted-foreground"
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'currentColor', opacity: 0.05 }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value) => [`${value} estudiantes`, 'Cantidad']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                      {gradeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
                  <Star className="h-8 w-8 opacity-20" />
                  <span>Aún no hay calificaciones para mostrar.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search + Filter Row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por estudiante o tarea..."
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium"
          />
        </div>
        <div className="relative w-full sm:w-[200px]">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="all">Todas las entregas</option>
            <option value="pending">Pendientes</option>
            <option value="graded">Calificadas</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Entregas List Grouped by Module and Task */}
      {entregasAgrupadas.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin resultados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No se encontraron entregas que coincidan con los filtros en este curso.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {entregasAgrupadas.map((modulo) => {
            const isModExpanded = !!expandedModules[modulo.modulo_titulo];

            return (
              <div key={modulo.modulo_titulo} className="animate-in slide-in-from-bottom-2 duration-300">
                {/* Module Header (Clickable for Accordion) */}
                <div
                  className={`bg-primary/5 rounded-t-2xl p-4 border border-primary/20 flex items-center gap-3 cursor-pointer select-none transition-colors hover:bg-primary/10 ${!isModExpanded ? 'rounded-b-2xl' : ''}`}
                  onClick={() =>
                    setExpandedModules((prev) => ({ ...prev, [modulo.modulo_titulo]: !prev[modulo.modulo_titulo] }))
                  }
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookCheck className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-foreground flex-1 truncate">
                    {modulo.modulo_titulo}
                  </h2>

                  {/* Module Badges */}
                  <div className="hidden sm:flex items-center gap-2">
                    {modulo.pendingCount > 0 ? (
                      <span className="bg-amber-500/10 text-amber-600 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Star className="h-3 w-3" /> {modulo.pendingCount} Pendiente
                        {modulo.pendingCount !== 1 ? 's' : ''}
                      </span>
                    ) : modulo.gradedCount > 0 ? (
                      <span className="bg-emerald-500/10 text-emerald-600 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Check className="h-3 w-3" /> Al día
                      </span>
                    ) : null}
                  </div>

                  <div className="p-2 bg-background/50 rounded-lg shrink-0">
                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${isModExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {/* Module Tasks Wrapper */}
                {isModExpanded && (
                  <div className="border border-t-0 border-border rounded-b-2xl p-4 sm:p-6 bg-card space-y-6">
                    {modulo.tareas.map((grupo) => {
                      const taskKey = `${modulo.modulo_titulo}-${grupo.tarea_titulo}`;
                      const isTaskExpanded = !!expandedTasks[taskKey];

                      return (
                        <div key={grupo.tarea_titulo} className="space-y-4">
                          {/* Task Header (Clickable for Accordion) */}
                          <div
                            className="flex items-center gap-3 pb-2 border-b border-border/50 cursor-pointer select-none group"
                            onClick={() => setExpandedTasks((prev) => ({ ...prev, [taskKey]: !prev[taskKey] }))}
                          >
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                              <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-foreground flex-1 truncate group-hover:text-primary transition-colors">
                              {grupo.tarea_titulo}
                            </h3>

                            {/* Task Badges */}
                            <div className="flex items-center gap-2">
                              {grupo.pendingCount > 0 ? (
                                <span className="bg-amber-500/10 text-amber-600 text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">
                                  {grupo.pendingCount} Pendiente{grupo.pendingCount !== 1 ? 's' : ''}
                                </span>
                              ) : grupo.gradedCount > 0 ? (
                                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">
                                  Al día
                                </span>
                              ) : (
                                <span className="bg-muted text-muted-foreground text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">
                                  Sin entregas
                                </span>
                              )}
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isTaskExpanded ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </div>

                          {/* Task Submissions List */}
                          {isTaskExpanded && (
                            <div className="grid grid-cols-1 gap-4 pl-2 md:pl-4 border-l-2 border-border animate-in slide-in-from-top-1 duration-200">
                              {grupo.entregas.map((entrega) => {
                                const isGrading = gradingGuid === entrega.guid;
                                const isCalificada = entrega.estado === 'CALIFICADA';
                                const nota = entrega.calificacion != null
                                  ? formatearPuntos(entrega.calificacion)
                                  : null;
                                const comentario = entrega.comentario ?? null;

                                return (
                                  <div
                                    key={entrega.guid}
                                    className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all ${
                                      isCalificada ? 'border-emerald-500/30' : 'border-border hover:border-primary/50'
                                    } ${isGrading ? 'ring-2 ring-primary/50 shadow-md' : ''}`}
                                  >
                                    {/* Compact/Summary View */}
                                    <div
                                      className={`p-5 flex flex-col md:flex-row md:items-center gap-4 ${isGrading ? 'bg-muted/10 border-b border-border/50' : ''}`}
                                    >
                                      {/* Left: Info */}
                                      <div className="flex-1 min-w-0 flex items-center gap-4">
                                        <div
                                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                            isCalificada
                                              ? 'bg-emerald-500/10 text-emerald-600'
                                              : 'bg-amber-500/10 text-amber-600'
                                          }`}
                                        >
                                          {entrega.estudiante?.nombre?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-base text-foreground truncate">
                                              {entrega.estudiante?.nombre} {entrega.estudiante?.apellido}
                                            </h4>
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                isCalificada
                                                  ? 'bg-emerald-500/10 text-emerald-600'
                                                  : 'bg-amber-500/10 text-amber-600'
                                              }`}
                                            >
                                              {isCalificada ? 'Calificada' : 'Pendiente'}
                                            </span>
                                          </div>
                                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            {entrega.fecha_entrega
                                              ? new Date(entrega.fecha_entrega).toLocaleString('es-ES', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })
                                              : 'Sin fecha'}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Right: Actions / Status (Hidden when grading to avoid clutter) */}
                                      {!isGrading && (
                                        <div className="flex items-center gap-3 shrink-0">
                                          {/* File Button */}
                                          {entrega.archivo_servidor && (
                                            <a
                                              href={urlDeArchivo(entrega.archivo_url) ?? ''}
                                              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl text-xs font-bold transition-colors"
                                              title="Descargar entrega"
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              <Download className="h-4 w-4" />
                                              <span className="hidden sm:inline max-w-[150px] truncate">
                                                {entrega.archivo_nombre}
                                              </span>
                                            </a>
                                          )}

                                          {/* Grade/Calificar */}
                                          {isCalificada && nota ? (
                                            <div className="flex items-center gap-2">
                                              <div className="bg-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                                <span className="text-sm font-bold text-emerald-600">{nota}</span>
                                                <span className="text-[10px] font-bold text-emerald-600/70">/ {NOTA_MAXIMA}</span>
                                              </div>
                                              <button
                                                onClick={() => {
                                                  setGradingGuid(entrega.guid);
                                                  setGradeValue(nota.toString());
                                                  setGradeComment(comentario || '');
                                                }}
                                                className="p-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition-colors"
                                                title="Editar Calificación"
                                              >
                                                <Edit3 className="h-4 w-4" />
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                setGradingGuid(entrega.guid);
                                                setGradeValue('');
                                                setGradeComment('');
                                              }}
                                              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 shadow-sm"
                                            >
                                              <Star className="h-4 w-4" /> Calificar
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Expanded Grading Panel */}
                                    {isGrading && (
                                      <div className="p-6 bg-card/50 animate-in slide-in-from-top-2 duration-300">
                                        {/* Top: File Review Section */}
                                        <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                                          <div>
                                            <h5 className="text-sm font-bold text-primary flex items-center gap-2 mb-1">
                                              <FileText className="h-4 w-4" /> Archivo Enviado por el Estudiante
                                            </h5>
                                            <p className="text-xs text-muted-foreground">
                                              Revisa el documento antes de asignar la calificación.
                                            </p>
                                          </div>
                                          {entrega.archivo_servidor ? (
                                            <a
                                              href={urlDeArchivo(entrega.archivo_url) ?? ''}
                                              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-transform hover:-translate-y-0.5 shadow-md shrink-0"
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              <Download className="h-4 w-4" /> Descargar{' '}
                                              {entrega.archivo_nombre
                                                ? `(${entrega.archivo_nombre.length > 15 ? entrega.archivo_nombre.substring(0, 15) + '...' : entrega.archivo_nombre})`
                                                : ''}
                                            </a>
                                          ) : (
                                            <span className="text-sm font-medium text-muted-foreground italic">
                                              Sin archivo adjunto
                                            </span>
                                          )}
                                        </div>

                                        {/* Bottom: Grading Form */}
                                        <div className="flex flex-col md:flex-row gap-6">
                                          {/* Grade Input */}
                                          <div className="w-full md:w-48 shrink-0">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                                              Calificación (0 – {NOTA_MAXIMA})
                                            </label>
                                            <div className="relative">
                                              <input
                                                type="text"
                                                value={gradeValue}
                                                onChange={(e) => handleGradeChange(e.target.value)}
                                                className="w-full bg-background border-2 border-border rounded-xl pl-4 pr-12 py-4 text-2xl font-black text-primary focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/20 transition-all"
                                                placeholder="0.0"
                                                autoFocus
                                              />
                                              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                                                / {NOTA_MAXIMA}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Comment Input */}
                                          <div className="flex-1 w-full flex flex-col">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2 flex items-center gap-2">
                                              <MessageSquare className="h-3.5 w-3.5" /> Retroalimentación{' '}
                                              <span className="text-muted-foreground/50 lowercase">(opcional)</span>
                                            </label>
                                            <textarea
                                              value={gradeComment}
                                              onChange={(e) => setGradeComment(e.target.value)}
                                              className="w-full flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none min-h-[80px]"
                                              placeholder="Escribe un comentario o retroalimentación constructiva para el estudiante..."
                                            />
                                          </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
                                          <button
                                            onClick={() => setGradingGuid(null)}
                                            className="px-6 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-bold transition-colors"
                                          >
                                            Cancelar
                                          </button>
                                          <button
                                            onClick={() => handleCalificar(entrega.guid)}
                                            disabled={saving || !gradeValue}
                                            className="flex items-center gap-2 px-8 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-transform hover:-translate-y-0.5 shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
                                          >
                                            {saving ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Check className="h-4 w-4" />
                                            )}
                                            Guardar Calificación
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
