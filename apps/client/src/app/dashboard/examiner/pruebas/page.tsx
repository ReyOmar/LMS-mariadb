'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Loader2,
  Check,
  Search,
  FileText,
  Star,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  TrendingUp,
  ChevronDown,
  Image as ImageIcon,
  PieChart as PieChartIcon,
  AlertCircle,
  Award,
  BookMarked,
  History,
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
import api from '@/lib/api';
import { NOTA_APROBACION_DEFECTO, NOTA_MAXIMA, aNota } from '@/lib/calificacion';

/** Nota de una entrega calificada. Antes se extraía partiendo la cadena "NOTA: 4.5 | …". */
const extractNota = (e: { estado?: string; calificacion?: unknown }): number | null =>
  e.estado === 'CALIFICADA' ? aNota(e.calificacion) : null;

export default function MonitoreoPruebasPage() {
  const { user } = useRole();
  const [entregas, setEntregas] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down state
  const [selectedCourseGuid, setSelectedCourseGuid] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'aprobados' | 'reprobados'>('all');

  // Accordion state
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

  /** Intentos de cuestionario de los cursos que gestiona el examinador. */
  const fetchData = useCallback(async () => {
    try {
      const [resIntentos, resCursos] = await Promise.all([
        api.get('/evaluaciones/examinador/cuestionarios'),
        api.get('/cursos'),
      ]);
      setEntregas(Array.isArray(resIntentos.data) ? resIntentos.data : []);
      setCursos(Array.isArray(resCursos.data) ? resCursos.data : []);
    } catch (error) {
      console.error('No se pudieron cargar los resultados de los cuestionarios', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchData();
  }, [user?.guid, fetchData]);

  useEventoRealtime('submission:graded', () => fetchData());

  const cursosAgrupados = useMemo(() => {
    const map = new Map<string, any>();

    cursos.forEach((c) => {
      map.set(c.guid, {
        guid: c.guid,
        titulo: c.titulo,
        imagen_portada: c.imagen_portada,
        intentos_totales: 0,
        aprobados: 0,
        reprobados: 0,
        suma_notas: 0,
        promedio: 0,
        tasa_aprobacion: 0,
        entregas: [],
        estudiantesMap: new Map<string, any>(),
      });
    });

    entregas.forEach((e) => {
      if (!map.has(e.curso_guid)) {
        map.set(e.curso_guid, {
          guid: e.curso_guid,
          titulo: e.curso_titulo,
          imagen_portada: null,
          intentos_totales: 0,
          aprobados: 0,
          reprobados: 0,
          suma_notas: 0,
          promedio: 0,
          tasa_aprobacion: 0,
          entregas: [],
          estudiantesMap: new Map<string, any>(),
        });
      }
      const curso = map.get(e.curso_guid)!;
      curso.intentos_totales++;
      curso.entregas.push(e);

      const nota = extractNota(e);
      if (e.estudiante?.guid && nota !== null) {
        if (!curso.estudiantesMap.has(e.estudiante.guid)) {
          curso.estudiantesMap.set(e.estudiante.guid, { mejor_nota: nota });
        } else {
          const currentBest = curso.estudiantesMap.get(e.estudiante.guid).mejor_nota;
          if (nota > currentBest) {
            curso.estudiantesMap.set(e.estudiante.guid, { mejor_nota: nota });
          }
        }
      }
    });

    return Array.from(map.values()).map((c) => {
      let suma = 0;
      let calificados = 0;
      let aprobados = 0;
      let reprobados = 0;

      c.estudiantesMap.forEach((studentStats: any) => {
        suma += studentStats.mejor_nota;
        calificados++;
        if (studentStats.mejor_nota >= NOTA_APROBACION_DEFECTO) aprobados++;
        else reprobados++;
      });

      c.aprobados = aprobados;
      c.reprobados = reprobados;
      c.suma_notas = suma;
      c.promedio = calificados > 0 ? (suma / calificados).toFixed(1) : '0.0';
      c.tasa_aprobacion = calificados > 0 ? Math.round((aprobados / calificados) * 100) : 0;

      return c;
    });
  }, [entregas, cursos]);

  const selectedCourse = cursosAgrupados.find((c) => c.guid === selectedCourseGuid);

  const gradeDistribution = useMemo(() => {
    if (!selectedCourse) return [];
    const ranges = [
      { name: `Por debajo de ${Math.round(NOTA_APROBACION_DEFECTO * 0.75)}`, count: 0, fill: '#ef4444' },
      {
        name: `Entre ${Math.round(NOTA_APROBACION_DEFECTO * 0.75)} y ${NOTA_APROBACION_DEFECTO - 1}`,
        count: 0,
        fill: '#f59e0b',
      },
      { name: `${NOTA_APROBACION_DEFECTO} o más (aprobado)`, count: 0, fill: '#10b981' },
    ];
    selectedCourse.estudiantesMap.forEach((studentStats: any) => {
      const val = studentStats.mejor_nota;
      if (val !== null) {
        if (val < 3) ranges[0].count++;
        else if (val < 4) ranges[1].count++;
        else ranges[2].count++;
      }
    });
    return ranges.filter((r) => r.count > 0);
  }, [selectedCourse]);

  const coursePieData =
    selectedCourse && (selectedCourse.aprobados > 0 || selectedCourse.reprobados > 0)
      ? [
          { name: 'Aprobados', value: selectedCourse.aprobados, color: '#10b981' },
          { name: 'Reprobados', value: selectedCourse.reprobados, color: '#ef4444' },
        ].filter((d) => d.value > 0)
      : [{ name: 'Sin calificar', value: 1, color: '#94a3b8' }];

  const filtered = useMemo(() => {
    return (selectedCourse?.entregas || []).filter((e: any) => {
      const q = search.toLowerCase();
      const cleanTitle = (e.tarea_titulo || '').replace('[QUIZ] ', '').trim().toLowerCase();
      const matchesSearch =
        e.estudiante?.nombre?.toLowerCase().includes(q) ||
        e.estudiante?.apellido?.toLowerCase().includes(q) ||
        cleanTitle.includes(q);

      const nota = extractNota(e);
      if (filter === 'aprobados') return matchesSearch && nota !== null && nota >= NOTA_APROBACION_DEFECTO;
      if (filter === 'reprobados') return matchesSearch && nota !== null && nota < NOTA_APROBACION_DEFECTO;
      return matchesSearch;
    });
  }, [selectedCourse, search, filter]);

  const entregasAgrupadas = useMemo(() => {
    // groups: Módulo -> Tarea -> Estudiante -> Intentos
    const groups: Record<string, Record<string, Record<string, any[]>>> = {};

    filtered.forEach((e: any) => {
      const modTitle = e.modulo_titulo || 'Módulo Principal';
      const taskTitle = (e.tarea_titulo || 'Sin título').replace('[QUIZ] ', '').trim();
      const studentId = e.estudiante?.guid || 'desconocido';

      if (!groups[modTitle]) groups[modTitle] = {};
      if (!groups[modTitle][taskTitle]) groups[modTitle][taskTitle] = {};
      if (!groups[modTitle][taskTitle][studentId]) groups[modTitle][taskTitle][studentId] = [];

      groups[modTitle][taskTitle][studentId].push(e);
    });

    return Object.entries(groups).map(([modulo_titulo, tareasMap]) => {
      let modSuma = 0;
      let modEstudiantesCalificados = 0;

      const tareas = Object.entries(tareasMap).map(([tarea_titulo, estudiantesMap]) => {
        let taskSuma = 0;
        let taskEstudiantesCalificados = 0;

        const estudiantesList = Object.entries(estudiantesMap).map(([studentId, entregasDelEstudiante]) => {
          const entregasOrdenadas = [...entregasDelEstudiante].sort(
            (a, b) => new Date(b.fecha_entrega).getTime() - new Date(a.fecha_entrega).getTime(),
          );

          let mejorNota: number | null = null;
          entregasOrdenadas.forEach((e) => {
            const n = extractNota(e);
            if (n !== null) {
              if (mejorNota === null || n > mejorNota) mejorNota = n;
            }
          });

          if (mejorNota !== null) {
            taskSuma += mejorNota;
            taskEstudiantesCalificados++;
          }

          return {
            estudiante: entregasOrdenadas[0].estudiante,
            intentos: entregasOrdenadas,
            mejorNota: mejorNota,
            cantidadIntentos: entregasOrdenadas.length,
          };
        });

        estudiantesList.sort((a, b) => (b.mejorNota || 0) - (a.mejorNota || 0));

        modSuma += taskSuma;
        modEstudiantesCalificados += taskEstudiantesCalificados;

        return {
          tarea_titulo,
          estudiantes: estudiantesList,
          promedio: taskEstudiantesCalificados > 0 ? (taskSuma / taskEstudiantesCalificados).toFixed(1) : '0.0',
        };
      });

      return {
        modulo_titulo,
        tareas,
        promedio: modEstudiantesCalificados > 0 ? (modSuma / modEstudiantesCalificados).toFixed(1) : '0.0',
      };
    });
  }, [filtered]);

  // View 1: Course Directory
  if (!selectedCourseGuid && !loading) {
    if (cursosAgrupados.length === 0) {
      return (
        <div className="animate-in fade-in duration-700">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              Analítica de Pruebas
            </h1>
            <p className="text-muted-foreground mt-2">
              Supervisa el rendimiento académico de los estudiantes en los cuestionarios.
            </p>
          </header>
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">No hay cursos asignados</h3>
            <p className="text-muted-foreground text-sm mt-1">Actualmente no tienes cursos asignados para analizar.</p>
          </div>
        </div>
      );
    }

    const filteredCursos = cursosAgrupados.filter((c) => c.titulo.toLowerCase().includes(courseSearch.toLowerCase()));

    let totalAprobadosGlobal = 0;
    let totalReprobadosGlobal = 0;
    let totalSumaGlobal = 0;
    let totalCalificadosGlobal = 0;

    cursosAgrupados.forEach((c) => {
      totalAprobadosGlobal += c.aprobados;
      totalReprobadosGlobal += c.reprobados;
      totalSumaGlobal += c.suma_notas;
      totalCalificadosGlobal += c.aprobados + c.reprobados;
    });

    const promedioGlobal = totalCalificadosGlobal > 0 ? (totalSumaGlobal / totalCalificadosGlobal).toFixed(1) : '0.0';
    const tasaAprobacionGlobal =
      totalCalificadosGlobal > 0 ? Math.round((totalAprobadosGlobal / totalCalificadosGlobal) * 100) : 0;

    const globalPieData =
      totalCalificadosGlobal > 0
        ? [
            { name: 'Aprobados', value: totalAprobadosGlobal, color: '#10b981' },
            { name: 'Reprobados', value: totalReprobadosGlobal, color: '#ef4444' },
          ]
        : [{ name: 'Sin datos', value: 1, color: '#94a3b8' }];

    const courseBarData = cursosAgrupados
      .filter((c) => c.aprobados + c.reprobados > 0)
      .map((c) => ({
        name: c.titulo.length > 15 ? c.titulo.substring(0, 15) + '...' : c.titulo,
        Promedio: parseFloat(c.promedio),
        guid: c.guid,
      }));

    return (
      <div className="animate-in fade-in duration-700">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Analítica de Pruebas
          </h1>
          <p className="text-muted-foreground mt-2">
            Supervisa el rendimiento académico de los cuestionarios automatizados en tus cursos.
          </p>
        </header>

        {/* Global Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-black">{totalCalificadosGlobal}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Estudiantes Calificados
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-black text-emerald-600">{tasaAprobacionGlobal}%</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Tasa de Aprobación Global
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/5 to-transparent z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <span className="text-2xl font-black text-primary">{promedioGlobal}</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Promedio Global (0-5)
              </p>
            </div>
          </div>
        </div>

        {/* Global Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <PieChartIcon className="h-5 w-5 text-emerald-500" />
              Aprobación Global
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={globalPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="hsl(var(--card))"
                    strokeWidth={4}
                    cornerRadius={6}
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
                      color: 'hsl(var(--foreground))',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value) => [`${value} estudiantes`, 'Total']}
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

          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              Promedio de Notas por Curso
            </h3>
            <div className="h-[200px] w-full">
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
                      tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 600 }}
                      className="text-muted-foreground"
                      dy={10}
                    />
                    <YAxis
                      domain={[0, 5]}
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
                      itemStyle={{ color: 'var(--primary)' }}
                      formatter={(value) => [`${value} / ${NOTA_MAXIMA}`, 'Promedio']}
                    />
                    <Bar dataKey="Promedio" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={50}>
                      {courseBarData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Promedio >= NOTA_APROBACION_DEFECTO ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos suficientes para calcular promedios.
                </div>
              )}
            </div>
          </div>
        </div>

        {cursosAgrupados.length > 0 && (
          <div className="relative max-w-lg mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Buscar curso por nombre..."
              className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
            />
          </div>
        )}

        {filteredCursos.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Sin cursos para mostrar</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No se encontraron cursos que coincidan con la búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredCursos.map((curso, idx) => {
              const isExcellent = Number.parseFloat(curso.promedio) >= 90;
              const isBad = Number.parseFloat(curso.promedio) < NOTA_APROBACION_DEFECTO && curso.aprobados + curso.reprobados > 0;

              return (
                <div
                  key={curso.guid || `curso-${idx}`}
                  className="bg-card border border-border/50 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 rounded-3xl p-6 flex flex-col h-full relative cursor-pointer group"
                  onClick={() => setSelectedCourseGuid(curso.guid)}
                >
                  <h3 className="font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2 pr-8">
                    {curso.titulo}
                  </h3>

                  <div className="absolute top-6 right-6 p-2 bg-primary/10 text-primary rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  <div className="flex items-center gap-5 mt-auto bg-background/50 p-4 rounded-2xl border border-border/30">
                    <div className="w-16 h-16 shrink-0 rounded-full flex flex-col items-center justify-center border-4 border-background relative">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle cx="50%" cy="50%" r="45%" className="fill-none stroke-muted stroke-[10%]" />
                        <circle
                          cx="50%"
                          cy="50%"
                          r="45%"
                          className={`fill-none stroke-[10%] stroke-linecap-round ${isBad ? 'stroke-red-500' : 'stroke-emerald-500'}`}
                          strokeDasharray="283%"
                          strokeDashoffset={`${283 - (283 * curso.tasa_aprobacion) / 100}%`}
                        />
                      </svg>
                      <span className="text-xs font-black relative z-10">{curso.tasa_aprobacion}%</span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground uppercase tracking-wider font-bold">Promedio</span>
                        <span
                          className={`font-black text-sm ${isBad ? 'text-red-500' : isExcellent ? 'text-emerald-500' : 'text-primary'}`}
                        >
                          {curso.promedio}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-1 pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">
                          Aprobados: <strong className="text-emerald-500">{curso.aprobados}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Reprobados: <strong className="text-red-500">{curso.reprobados}</strong>
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
    return <PageLoader message="Cargando analíticas del curso..." />;
  }

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <button
        onClick={() => {
          setSelectedCourseGuid(null);
          setSearch('');
          setFilter('all');
        }}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al panel analítico
      </button>

      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3 mb-6">
          <BookMarked className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          {selectedCourse?.titulo}
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-black">{selectedCourse?.aprobados + selectedCourse?.reprobados}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Estudiantes Evaluados
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-black text-emerald-600">{selectedCourse?.tasa_aprobacion}%</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Tasa de Aprobación
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <span className="text-2xl font-black text-primary">{selectedCourse?.promedio}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Promedio de Notas</p>
          </div>
        </div>
      </header>

      {selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <PieChartIcon className="h-5 w-5 text-emerald-500" />
              Tasa de Aprobación del Curso
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={coursePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="hsl(var(--card))"
                    strokeWidth={4}
                    cornerRadius={6}
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
                      color: 'hsl(var(--foreground))',
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value) => [`${value} estudiantes`, 'Total']}
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

          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              Campana de Notas
            </h3>
            <div className="h-[200px] w-full">
              {gradeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 600 }}
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
                  <span>Aún no hay pruebas calificadas.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search + Filter Row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por estudiante o cuestionario..."
            className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
          />
        </div>
        <div className="relative w-full sm:w-[220px]">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="all">Todas las notas</option>
            <option value="aprobados">Solo aprobados</option>
            <option value="reprobados">Solo no aprobados</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {entregasAgrupadas.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-16 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin resultados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No se encontraron cuestionarios que coincidan con los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {entregasAgrupadas.map((modulo) => {
            const isModExpanded = !!expandedModules[modulo.modulo_titulo];

            return (
              <div key={modulo.modulo_titulo} className="animate-in slide-in-from-bottom-2 duration-300">
                <div
                  className={`bg-primary/5 p-4 border border-primary/20 flex items-center gap-4 cursor-pointer select-none transition-colors hover:bg-primary/10 ${!isModExpanded ? 'rounded-2xl' : 'rounded-t-2xl'}`}
                  onClick={() =>
                    setExpandedModules((prev) => ({ ...prev, [modulo.modulo_titulo]: !prev[modulo.modulo_titulo] }))
                  }
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookMarked className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{modulo.modulo_titulo}</h2>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Promedio del módulo: <strong className="text-primary">{modulo.promedio}</strong>
                    </p>
                  </div>

                  <div className="p-2 bg-background/50 rounded-full shrink-0">
                    <ChevronDown
                      className={`h-5 w-5 text-primary transition-transform duration-300 ${isModExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {isModExpanded && (
                  <div className="border border-t-0 border-border rounded-b-2xl p-4 sm:p-6 bg-card space-y-6">
                    {modulo.tareas.map((grupo) => {
                      const taskKey = `${modulo.modulo_titulo}-${grupo.tarea_titulo}`;
                      const isTaskExpanded = !!expandedTasks[taskKey];

                      return (
                        <div key={grupo.tarea_titulo} className="space-y-4">
                          <div
                            className="flex items-center gap-3 pb-3 border-b border-border/50 cursor-pointer select-none group"
                            onClick={() => setExpandedTasks((prev) => ({ ...prev, [taskKey]: !prev[taskKey] }))}
                          >
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                              <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <h3 className="text-base font-bold text-foreground flex-1 truncate group-hover:text-primary transition-colors">
                              {grupo.tarea_titulo}
                            </h3>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold bg-muted px-3 py-1 rounded-full text-muted-foreground">
                                Promedio: {grupo.promedio}
                              </span>
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isTaskExpanded ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </div>

                          {isTaskExpanded && (
                            <div className="grid grid-cols-1 gap-4 pl-2 md:pl-4 border-l-2 border-border/50 animate-in slide-in-from-top-1 duration-200 pt-2">
                              {grupo.estudiantes.map((estItem: any) => {
                                const nota = estItem.mejorNota;
                                const isAprobado = nota !== null && nota >= NOTA_APROBACION_DEFECTO;
                                const isReprobado = nota !== null && nota < 3.0;
                                const estKey = `${taskKey}-${estItem.estudiante?.guid || 'unknown'}`;
                                const isEstExpanded = !!expandedStudents[estKey];

                                return (
                                  <div
                                    key={estKey}
                                    className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md ${
                                      isAprobado
                                        ? 'border-emerald-500/30'
                                        : isReprobado
                                          ? 'border-red-500/30'
                                          : 'border-border'
                                    }`}
                                  >
                                    <div
                                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none group/est"
                                      onClick={() =>
                                        setExpandedStudents((prev) => ({ ...prev, [estKey]: !prev[estKey] }))
                                      }
                                    >
                                      <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <div
                                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-inner ${
                                            isAprobado
                                              ? 'bg-emerald-500/10 text-emerald-600'
                                              : isReprobado
                                                ? 'bg-red-500/10 text-red-600'
                                                : 'bg-muted text-muted-foreground'
                                          }`}
                                        >
                                          {estItem.estudiante?.nombre?.charAt(0) || '?'}
                                        </div>
                                        <div className="truncate flex-1">
                                          <h4 className="font-bold text-sm text-foreground truncate group-hover/est:text-primary transition-colors">
                                            {estItem.estudiante?.nombre} {estItem.estudiante?.apellido}
                                          </h4>
                                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                            <History className="h-3 w-3" /> {estItem.cantidadIntentos} intento
                                            {estItem.cantidadIntentos !== 1 && 's'} realizado
                                            {estItem.cantidadIntentos !== 1 && 's'}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex items-center gap-4">
                                        {nota !== null ? (
                                          <div
                                            className={`px-4 py-2 rounded-xl flex items-center gap-1 ${isAprobado ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
                                          >
                                            <span
                                              className={`text-lg font-black ${isAprobado ? 'text-emerald-600' : 'text-red-600'}`}
                                            >
                                              {nota.toFixed(1)}
                                            </span>
                                            <span
                                              className={`text-xs font-bold hidden sm:inline ${isAprobado ? 'text-emerald-600/50' : 'text-red-600/50'}`}
                                            >
                                               / 100
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="bg-amber-500/10 px-3 py-1.5 rounded-xl">
                                            <span className="text-xs font-bold text-amber-600">Procesando</span>
                                          </div>
                                        )}
                                        <ChevronDown
                                          className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${isEstExpanded ? 'rotate-180' : ''}`}
                                        />
                                      </div>
                                    </div>

                                    {/* Historial de Intentos */}
                                    {isEstExpanded && (
                                      <div className="bg-muted/10 border-t border-border/50 p-4 animate-in slide-in-from-top-2 duration-300">
                                        <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4 px-2">
                                          Historial de Intentos
                                        </h5>
                                        <div className="space-y-3 relative ml-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
                                          {estItem.intentos.map((intento: any, idx: number) => {
                                            const intentoNota = extractNota(intento);
                                            const isIntAprobado = intentoNota !== null && intentoNota >= 3.0;
                                            const isIntReprobado = intentoNota !== null && intentoNota < 3.0;

                                            return (
                                              <div key={intento.guid} className="relative flex items-center gap-3 pl-4">
                                                <div className="absolute left-0 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full border-4 border-card bg-background text-muted-foreground shadow-sm z-10 text-[10px] font-bold">
                                                  #{estItem.cantidadIntentos - idx}
                                                </div>
                                                <div className="flex-1 ml-4 p-3 rounded-xl bg-card border border-border/50 shadow-sm flex items-center justify-between hover:border-primary/30 transition-colors">
                                                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                                    {intento.fecha_entrega
                                                      ? new Date(intento.fecha_entrega).toLocaleString('es-ES', {
                                                          day: '2-digit',
                                                          month: 'short',
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                        })
                                                      : 'Sin fecha'}
                                                  </span>
                                                  {intentoNota !== null ? (
                                                    <div
                                                      className={`px-2.5 py-1 rounded-md ${isIntAprobado ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
                                                    >
                                                      <span
                                                        className={`text-sm font-black ${isIntAprobado ? 'text-emerald-600' : 'text-red-600'}`}
                                                      >
                                                        {intentoNota.toFixed(1)}
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <span className="text-xs font-bold text-amber-500">?</span>
                                                  )}
                                                </div>
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
