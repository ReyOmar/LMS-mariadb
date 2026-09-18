'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Users,
  Clock,
  BookOpen,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Loader2,
  TrendingUp,
  Filter,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime, useRealtime } from '@/contexts/RealtimeContext';
import api from '@/lib/api';
import { useDebounce } from '@/hooks/usePerformance';
import dynamic from 'next/dynamic';
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });

export default function MonitoreoEstudiantesPage() {
  const { user } = useRole();
  const { usuariosEnLinea } = useRealtime();
  const [estudiantes, setEstudiantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [cursoFiltro, setCursoFiltro] = useState<string>('todos');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  /**
   * Avance de los alumnos de los cursos que gestiona quien consulta.
   * El servidor decide de quién son esos cursos a partir del token: antes el identificador
   * del profesor viajaba por query y bastaba cambiarlo para ver los alumnos de otro.
   */
  const fetchMonitoreo = useCallback(async (conIndicador = true) => {
    try {
      if (conIndicador) setLoading(true);
      const { data } = await api.get('/dashboards/monitoreo');
      setEstudiantes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('No se pudo cargar el monitoreo', error);
    } finally {
      if (conIndicador) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchMonitoreo();
  }, [user?.guid, fetchMonitoreo]);

  // Refresco silencioso: el examinador puede estar mirando la tabla mientras cambia.
  useEventoRealtime('submission:new', () => fetchMonitoreo(false));
  useEventoRealtime('submission:graded', () => fetchMonitoreo(false));
  useEventoRealtime('enrollment:changed', () => fetchMonitoreo(false));
  useEventoRealtime('presence:update', () => fetchMonitoreo(false));

  // 1. Extraer lista única de cursos para el filtro
  const cursosUnicos = useMemo(() => {
    const cursosMap = new Map<string, string>();
    estudiantes.forEach((est) => {
      est.cursos.forEach((c: any) => {
        if (!cursosMap.has(c.curso_guid)) {
          cursosMap.set(c.curso_guid, c.curso_titulo);
        }
      });
    });
    return Array.from(cursosMap.entries()).map(([guid, titulo]) => ({ guid, titulo }));
  }, [estudiantes]);

  // 2. Filtrar estudiantes por búsqueda y por curso seleccionado
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return estudiantes.filter((e) => {
      const matchSearch =
        q === '' ||
        e.nombre?.toLowerCase().includes(q) ||
        e.apellido?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q);

      const matchCurso = cursoFiltro === 'todos' || e.cursos.some((c: any) => c.curso_guid === cursoFiltro);

      return matchSearch && matchCurso;
    });
  }, [estudiantes, debouncedSearch, cursoFiltro]);

  // 3. Calcular datos para el gráfico de barras basado en los estudiantes filtrados
  const chartData = useMemo(() => {
    let rango0_25 = 0;
    let rango26_50 = 0;
    let rango51_75 = 0;
    let rango76_100 = 0;

    filtered.forEach((est) => {
      let progress = 0;
      if (cursoFiltro !== 'todos') {
        const cursoEspecífico = est.cursos.find((c: any) => c.curso_guid === cursoFiltro);
        if (cursoEspecífico) progress = cursoEspecífico.porcentaje;
      } else {
        progress =
          est.cursos.length > 0
            ? Math.round(est.cursos.reduce((s: number, c: any) => s + c.porcentaje, 0) / est.cursos.length)
            : 0;
      }

      if (progress <= 25) rango0_25++;
      else if (progress <= 50) rango26_50++;
      else if (progress <= 75) rango51_75++;
      else rango76_100++;
    });

    return [
      { name: '0% - 25%', count: rango0_25, fill: '#ef4444' }, // Red
      { name: '26% - 50%', count: rango26_50, fill: '#f59e0b' }, // Amber
      { name: '51% - 75%', count: rango51_75, fill: '#3b82f6' }, // Blue
      { name: '76% - 100%', count: rango76_100, fill: '#10b981' }, // Emerald
    ];
  }, [filtered, cursoFiltro]);

  // 4. Calcular datos de accesos por día de la semana
  const accessChartData = useMemo(() => {
    const days = [
      { name: 'Dom', count: 0 },
      { name: 'Lun', count: 0 },
      { name: 'Mar', count: 0 },
      { name: 'Mié', count: 0 },
      { name: 'Jue', count: 0 },
      { name: 'Vie', count: 0 },
      { name: 'Sáb', count: 0 },
    ];

    filtered.forEach((est) => {
      // Consider explicitly online users as connecting "today"
      if (usuariosEnLinea.includes(est.guid)) {
        const todayIndex = new Date().getDay();
        days[todayIndex].count++;
      } else if (est.ultimo_acceso) {
        const date = new Date(est.ultimo_acceso);
        const dayIndex = date.getDay();
        days[dayIndex].count++;
      }
    });

    return days;
  }, [filtered, usuariosEnLinea]);

  const renderUltimoAcceso = (d: string | null, studentGuid: string) => {
    const isOnline = usuariosEnLinea.includes(studentGuid);

    if (isOnline) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-2 py-1 rounded-full w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          En línea
        </span>
      );
    }

    if (!d) return <span className="text-muted-foreground">Sin acceso</span>;
    const lastAccess = new Date(d);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastAccess.getTime()) / 60000);

    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {lastAccess.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    );
  };

  if (loading) {
    return <PageLoader message="Cargando monitoreo de estudiantes..." />;
  }

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Monitoreo de Estudiantes
        </h1>
        <p className="text-muted-foreground mt-2">
          Seguimiento interactivo del progreso de los estudiantes en tus cursos asignados.
        </p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="text-2xl font-bold">{filtered.length}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Estudiantes {cursoFiltro !== 'todos' && 'en este curso'}
          </p>
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <span className="text-2xl font-bold">{filtered.filter((e) => e.total_entregas > 0).length}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Estudiantes Activos</p>
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-500" />
            </div>
            <span className="text-2xl font-bold">{filtered.reduce((s, e) => s + e.total_entregas, 0)}</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Total Entregas</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Distribución de Progreso{' '}
            {cursoFiltro !== 'todos' ? `(${cursosUnicos.find((c) => c.guid === cursoFiltro)?.titulo})` : '(Promedio)'}
          </h3>
          {filtered.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No hay datos suficientes para graficar.
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
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
                  <Tooltip
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
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Días de Mayor Conexión
          </h3>
          {filtered.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No hay datos suficientes para graficar.
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accessChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value) => [`${value} conexiones`, 'Accesos']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={4}
                    dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                    activeDot={{ r: 8, fill: '#6366f1', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Controls Bar (Search & Filter) */}
      <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="relative w-full md:w-[400px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido o correo..."
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
          />
        </div>

        <div className="relative w-full md:w-[350px]">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={cursoFiltro}
            onChange={(e) => setCursoFiltro(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-11 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="todos">Todos los cursos asignados</option>
            {cursosUnicos.map((c) => (
              <option key={c.guid} value={c.guid}>
                {c.titulo}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Students List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin resultados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {search ? 'No se encontraron estudiantes con ese criterio de búsqueda.' : 'No hay estudiantes registrados.'}
          </p>
        </div>
      ) : (
        <>
          {/* === MOBILE CARD VIEW === */}
          <div className="lg:hidden space-y-3">
            {filtered.map((est) => {
              const isExpanded = expandedStudent === est.guid;
              let tableProgress = 0;
              if (cursoFiltro !== 'todos') {
                const cursoEspecífico = est.cursos.find((c: any) => c.curso_guid === cursoFiltro);
                if (cursoEspecífico) tableProgress = cursoEspecífico.porcentaje;
              } else {
                tableProgress =
                  est.cursos.length > 0
                    ? Math.round(est.cursos.reduce((s: number, c: any) => s + c.porcentaje, 0) / est.cursos.length)
                    : 0;
              }
              return (
                <div key={est.guid} className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                  <div
                    onClick={() => setExpandedStudent(isExpanded ? null : est.guid)}
                    className="p-4 cursor-pointer active:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">
                          {est.nombre} {est.apellido}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{est.email}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${est.total_entregas > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}
                      >
                        {est.total_entregas}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="shrink-0">{renderUltimoAcceso(est.ultimo_acceso, est.guid)}</div>
                      <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${tableProgress >= 76 ? 'bg-emerald-500' : tableProgress >= 51 ? 'bg-blue-500' : tableProgress >= 26 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${tableProgress}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground w-10 text-right">
                          {tableProgress}%
                        </span>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/30 px-4 py-4 bg-muted/5 animate-in fade-in duration-200">
                      <div className="space-y-2">
                        {est.cursos
                          .filter((c: any) => cursoFiltro === 'todos' || c.curso_guid === cursoFiltro)
                          .map((curso: any) => {
                            const courseKey = `${est.guid}-${curso.curso_guid}`;
                            const isCourseExpanded = expandedCourses.has(courseKey);
                            const toggleCourse = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              setExpandedCourses((prev) => {
                                const next = new Set(prev);
                                if (next.has(courseKey)) next.delete(courseKey);
                                else next.add(courseKey);
                                return next;
                              });
                            };
                            const totalModulos = curso.modulos?.length || 0;
                            const modulosCompletos = curso.modulos?.filter((m: any) => m.porcentaje >= 100).length || 0;
                            const totalRecursos =
                              curso.modulos?.reduce((s: number, m: any) => s + (m.total || 0), 0) || 0;
                            const recursosCompletados =
                              curso.modulos?.reduce((s: number, m: any) => s + (m.completados || 0), 0) || 0;

                            return (
                              <div
                                key={curso.curso_guid}
                                className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm"
                              >
                                <button
                                  onClick={toggleCourse}
                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                                >
                                  {isCourseExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                                  <span className="font-bold text-sm flex-1 truncate">{curso.curso_titulo}</span>
                                  <span
                                    className={`text-xs font-bold w-10 text-right ${
                                      curso.porcentaje >= 76
                                        ? 'text-emerald-600'
                                        : curso.porcentaje >= 51
                                          ? 'text-blue-600'
                                          : curso.porcentaje >= 26
                                            ? 'text-amber-600'
                                            : 'text-red-500'
                                    }`}
                                  >
                                    {curso.porcentaje}%
                                  </span>
                                </button>
                                {isCourseExpanded && (
                                  <div className="border-t border-border/30 px-4 py-3 bg-muted/5 animate-in slide-in-from-top-1 duration-200">
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                      <div className="bg-card border border-border/40 rounded-lg p-2 text-center">
                                        <p className="text-sm font-bold text-primary">{totalModulos}</p>
                                        <p className="text-[9px] text-muted-foreground font-medium uppercase">
                                          Módulos
                                        </p>
                                      </div>
                                      <div className="bg-card border border-border/40 rounded-lg p-2 text-center">
                                        <p className="text-sm font-bold text-emerald-600">{recursosCompletados}</p>
                                        <p className="text-[9px] text-muted-foreground font-medium uppercase">Hechos</p>
                                      </div>
                                      <div className="bg-card border border-border/40 rounded-lg p-2 text-center">
                                        <p className="text-sm font-bold text-amber-600">
                                          {totalRecursos - recursosCompletados}
                                        </p>
                                        <p className="text-[9px] text-muted-foreground font-medium uppercase">Pend.</p>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      {curso.modulos.map((mod: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg">
                                          <div
                                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                              mod.porcentaje >= 100
                                                ? 'bg-emerald-500/10 text-emerald-600'
                                                : mod.porcentaje > 0
                                                  ? 'bg-amber-500/10 text-amber-600'
                                                  : 'bg-muted text-muted-foreground'
                                            }`}
                                          >
                                            {i + 1}
                                          </div>
                                          <span className="text-xs font-medium flex-1 truncate">{mod.titulo}</span>
                                          <span
                                            className={`text-xs font-bold w-8 text-right ${
                                              mod.porcentaje >= 100 ? 'text-emerald-600' : 'text-muted-foreground'
                                            }`}
                                          >
                                            {mod.porcentaje}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* === DESKTOP TABLE VIEW === */}
          <div className="hidden lg:block bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 w-8"></th>
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Correo</th>
                  <th className="px-6 py-4">Última Actividad</th>
                  <th className="px-6 py-4">Entregas</th>
                  <th className="px-6 py-4">Progreso {cursoFiltro !== 'todos' && 'del Curso'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((est) => {
                  const isExpanded = expandedStudent === est.guid;

                  // Calculo dinámico del progreso en la tabla según el filtro
                  let tableProgress = 0;
                  if (cursoFiltro !== 'todos') {
                    const cursoEspecífico = est.cursos.find((c: any) => c.curso_guid === cursoFiltro);
                    if (cursoEspecífico) tableProgress = cursoEspecífico.porcentaje;
                  } else {
                    tableProgress =
                      est.cursos.length > 0
                        ? Math.round(est.cursos.reduce((s: number, c: any) => s + c.porcentaje, 0) / est.cursos.length)
                        : 0;
                  }

                  return (
                    <Fragment key={est.guid}>
                      <tr
                        onClick={() => setExpandedStudent(isExpanded ? null : est.guid)}
                        className="hover:bg-muted/10 transition-colors cursor-pointer"
                      >
                        <td className="pl-6 py-4">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold">
                          {est.nombre} {est.apellido}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{est.email}</td>
                        <td className="px-6 py-4">{renderUltimoAcceso(est.ultimo_acceso, est.guid)}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${est.total_entregas > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}
                          >
                            {est.total_entregas}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className={`h-full rounded-full transition-all ${tableProgress >= 76 ? 'bg-emerald-500' : tableProgress >= 51 ? 'bg-blue-500' : tableProgress >= 26 ? 'bg-amber-500' : 'bg-red-400'}`}
                                style={{ width: `${tableProgress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-muted-foreground w-10">{tableProgress}%</span>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Detail — Each course is expandable */}
                      {isExpanded && (
                        <tr className="bg-muted/5 animate-in fade-in duration-200">
                          <td colSpan={6} className="px-10 py-4">
                            <div className="space-y-2">
                              {est.cursos
                                .filter((c: any) => cursoFiltro === 'todos' || c.curso_guid === cursoFiltro)
                                .map((curso: any) => {
                                  const courseKey = `${est.guid}-${curso.curso_guid}`;
                                  const isCourseExpanded = expandedCourses.has(courseKey);
                                  const toggleCourse = (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setExpandedCourses((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(courseKey)) next.delete(courseKey);
                                      else next.add(courseKey);
                                      return next;
                                    });
                                  };
                                  const totalModulos = curso.modulos?.length || 0;
                                  const modulosCompletos =
                                    curso.modulos?.filter((m: any) => m.porcentaje >= 100).length || 0;
                                  const totalRecursos =
                                    curso.modulos?.reduce((s: number, m: any) => s + (m.total || 0), 0) || 0;
                                  const recursosCompletados =
                                    curso.modulos?.reduce((s: number, m: any) => s + (m.completados || 0), 0) || 0;

                                  return (
                                    <div
                                      key={curso.curso_guid}
                                      className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm"
                                    >
                                      {/* Course Header — clickable */}
                                      <button
                                        onClick={toggleCourse}
                                        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                                      >
                                        {isCourseExpanded ? (
                                          <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )}
                                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                                        <span className="font-bold text-sm flex-1">{curso.curso_titulo}</span>

                                        {/* Progress summary chips */}
                                        <div className="flex items-center gap-3 shrink-0">
                                          <span className="text-[11px] text-muted-foreground font-medium">
                                            {modulosCompletos}/{totalModulos} módulos
                                          </span>
                                          <span className="text-[11px] text-muted-foreground font-medium">
                                            {recursosCompletados}/{totalRecursos} recursos
                                          </span>
                                          <div className="flex items-center gap-2 w-28">
                                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${
                                                  curso.porcentaje >= 76
                                                    ? 'bg-emerald-500'
                                                    : curso.porcentaje >= 51
                                                      ? 'bg-blue-500'
                                                      : curso.porcentaje >= 26
                                                        ? 'bg-amber-500'
                                                        : 'bg-red-400'
                                                }`}
                                                style={{ width: `${curso.porcentaje}%` }}
                                              />
                                            </div>
                                            <span
                                              className={`text-xs font-bold w-10 text-right ${
                                                curso.porcentaje >= 76
                                                  ? 'text-emerald-600'
                                                  : curso.porcentaje >= 51
                                                    ? 'text-blue-600'
                                                    : curso.porcentaje >= 26
                                                      ? 'text-amber-600'
                                                      : 'text-red-500'
                                              }`}
                                            >
                                              {curso.porcentaje}%
                                            </span>
                                          </div>
                                        </div>
                                      </button>

                                      {/* Course Detail — modules breakdown */}
                                      {isCourseExpanded && (
                                        <div className="border-t border-border/30 px-5 py-4 bg-muted/5 animate-in slide-in-from-top-1 duration-200">
                                          {/* Course summary stats */}
                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                            <div className="bg-card border border-border/40 rounded-lg p-3 text-center">
                                              <p className="text-lg font-bold text-primary">{totalModulos}</p>
                                              <p className="text-[10px] text-muted-foreground font-medium uppercase">
                                                Módulos
                                              </p>
                                            </div>
                                            <div className="bg-card border border-border/40 rounded-lg p-3 text-center">
                                              <p className="text-lg font-bold text-emerald-600">
                                                {recursosCompletados}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground font-medium uppercase">
                                                Completados
                                              </p>
                                            </div>
                                            <div className="bg-card border border-border/40 rounded-lg p-3 text-center">
                                              <p className="text-lg font-bold text-amber-600">
                                                {totalRecursos - recursosCompletados}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground font-medium uppercase">
                                                Pendientes
                                              </p>
                                            </div>
                                          </div>

                                          {/* Module rows */}
                                          <div className="space-y-2">
                                            {curso.modulos.map((mod: any, i: number) => (
                                              <div
                                                key={i}
                                                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors"
                                              >
                                                <div
                                                  className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                                    mod.porcentaje >= 100
                                                      ? 'bg-emerald-500/10 text-emerald-600'
                                                      : mod.porcentaje > 0
                                                        ? 'bg-amber-500/10 text-amber-600'
                                                        : 'bg-muted text-muted-foreground'
                                                  }`}
                                                >
                                                  {i + 1}
                                                </div>
                                                <span className="text-xs font-medium flex-1 truncate">
                                                  {mod.titulo}
                                                </span>
                                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[180px]">
                                                  <div
                                                    className={`h-full rounded-full transition-all ${
                                                      mod.porcentaje >= 76
                                                        ? 'bg-emerald-500'
                                                        : mod.porcentaje >= 51
                                                          ? 'bg-blue-500'
                                                          : mod.porcentaje >= 26
                                                            ? 'bg-amber-500'
                                                            : 'bg-red-400'
                                                    }`}
                                                    style={{ width: `${mod.porcentaje}%` }}
                                                  />
                                                </div>
                                                <span className="text-xs font-bold text-muted-foreground w-16 text-right">
                                                  {mod.completados}/{mod.total}
                                                </span>
                                                <span
                                                  className={`text-xs font-bold w-10 text-right ${
                                                    mod.porcentaje >= 100 ? 'text-emerald-600' : 'text-muted-foreground'
                                                  }`}
                                                >
                                                  {mod.porcentaje}%
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
