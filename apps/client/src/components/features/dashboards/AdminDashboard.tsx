'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Users, Award, GraduationCap, AlertCircle, TrendingUp } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { StatCard } from '@/components/ui/StatCard';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import { useRole } from '@/contexts/RoleContext';
import { useSede } from '@/contexts/SedeContext';
import { NOTA_APROBACION_DEFECTO, formatearPuntos } from '@/lib/calificacion';

// Dynamically import Recharts to avoid SSR issues
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });

// Chart colors using the transport palette
const CHART_COLORS = {
  primary: 'hsl(207, 80%, 42%)',
  primaryLight: 'hsl(207, 80%, 55%)',
  accent: 'hsl(38, 92%, 50%)',
  success: 'hsl(152, 60%, 40%)',
  info: 'hsl(200, 70%, 50%)',
  danger: 'hsl(0, 72%, 51%)',
};

/** Paleta del reparto por curso. El color es presentación, así que se asigna aquí. */
const COLORES_REPARTO = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export function AdminDashboard() {
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { user } = useRole();
  const { nombre: nombreSede } = useSede();

  const fetchDashboardData = useCallback(async () => {
    const [solicitudes, resumen] = await Promise.all([
      api
        .get('/auth/solicitudes')
        .then((r) => r.data)
        .catch(() => []),
      api
        .get('/dashboards/administracion')
        .then((r) => r.data)
        .catch(() => null),
    ]);

    setSolicitudesPendientes(Array.isArray(solicitudes) ? solicitudes.length : 0);
    setStats(resumen);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  useEventoRealtime('request:new', fetchDashboardData);
  useEventoRealtime('request:resolved', fetchDashboardData);
  useEventoRealtime('dashboard:refresh', fetchDashboardData);

  // La API devuelve actividad y reparto sin color; la presentación la pone el cliente.
  const weeklyActivity = (stats?.actividadSemanal ?? []).map((dia: any) => ({
    day: dia.dia,
    sesiones: dia.recursos,
    entregas: dia.entregas,
  }));
  const courseDistribution = (stats?.repartoCursos ?? []).map((curso: any, indice: number) => ({
    name: curso.nombre,
    value: curso.matriculas,
    color: COLORES_REPARTO[indice % COLORES_REPARTO.length],
  }));
  const totalMatriculas = stats?.totalMatriculas ?? 0;
  const promedio = stats?.promedioGlobal ?? null;

  if (loading) {
    return (
      <div className="animate-fade-slide-in">
        {/* Skeleton Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-10">
          <div>
            <div className="h-4 w-24 rounded-lg bg-muted animate-shimmer mb-2" />
            <div className="h-8 w-48 rounded-lg bg-muted animate-shimmer mb-1" />
            <div className="h-4 w-56 rounded-lg bg-muted animate-shimmer" />
          </div>
          <div className="h-8 w-40 rounded-full bg-muted animate-shimmer" />
        </div>
        {/* Skeleton KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/50 p-6 space-y-3"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-muted animate-shimmer" />
                <div className="h-4 w-16 rounded bg-muted animate-shimmer" />
              </div>
              <div className="h-8 w-20 rounded bg-muted animate-shimmer" />
              <div className="h-3 w-32 rounded bg-muted animate-shimmer" />
            </div>
          ))}
        </div>
        {/* Skeleton Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-border/50 p-6">
            <div className="h-5 w-40 rounded bg-muted animate-shimmer mb-2" />
            <div className="h-3 w-64 rounded bg-muted animate-shimmer mb-6" />
            <div className="h-64 rounded-xl bg-muted/50 animate-shimmer" />
          </div>
          <div className="rounded-2xl border border-border/50 p-6">
            <div className="h-5 w-36 rounded bg-muted animate-shimmer mb-2" />
            <div className="h-3 w-28 rounded bg-muted animate-shimmer mb-4" />
            <div className="h-52 rounded-full mx-auto w-40 bg-muted/50 animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide-in">
      {/* ── Header with greeting ── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-10">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting()},</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.nombre || 'Administrador'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Panel de control de la sede{nombreSede ? ` de ${nombreSede}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border/50 px-3 py-1.5 rounded-full shadow-sm">
          <span className="flex h-2 w-2 relative" title="Conexión en tiempo real activa">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <p className="text-xs text-muted-foreground font-medium">
            <span className="text-foreground font-semibold">
              {lastUpdated
                ? lastUpdated.toLocaleString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : '...'}
            </span>
          </p>
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Usuarios Activos"
          value={stats?.usuarios?.total || 0}
          icon={<Users className="h-5 w-5" />}
          color="primary"
          trend={{
            value: stats?.usuarios?.estudiantes || 0,
            label: `${stats?.usuarios?.estudiantes || 0} estudiantes · ${stats?.usuarios?.profesores || 0} profesores`,
          }}
          href="/dashboard/admin/usuarios"
          className="stagger-1 animate-fade-slide-in"
        />
        <StatCard
          label="Cursos"
          value={(stats?.cursos?.publicados || 0) + (stats?.cursos?.borrador || 0)}
          icon={<BookOpen className="h-5 w-5" />}
          color="info"
          trend={{
            value: stats?.cursos?.publicados || 0,
            label: `${stats?.cursos?.publicados || 0} publicados · ${stats?.cursos?.borrador || 0} borrador`,
          }}
          href="/dashboard/constructor-cursos"
          className="stagger-2 animate-fade-slide-in"
        />
        <StatCard
          label="Solicitudes Pendientes"
          value={solicitudesPendientes}
          icon={<AlertCircle className="h-5 w-5" />}
          color={solicitudesPendientes > 0 ? 'warning' : 'success'}
          trend={{
            value: solicitudesPendientes > 0 ? -1 : 1,
            label: solicitudesPendientes > 0 ? 'Requieren revisión' : 'Todo al día',
          }}
          href="/dashboard/admin/solicitudes"
          className="stagger-3 animate-fade-slide-in"
        />
        <StatCard
          label="Calificación media"
          value={promedio === null ? 0 : Number(formatearPuntos(promedio))}
          suffix=" / 100"
          icon={<GraduationCap className="h-5 w-5" />}
          color="accent"
          trend={{
            value: promedio !== null && promedio >= NOTA_APROBACION_DEFECTO ? 1 : -1,
            label:
              promedio === null
                ? 'Todavía sin calificaciones'
                : promedio >= 90
                  ? 'Rendimiento excelente'
                  : promedio >= NOTA_APROBACION_DEFECTO
                    ? `Por encima del umbral de ${NOTA_APROBACION_DEFECTO} puntos`
                    : `Por debajo del umbral de ${NOTA_APROBACION_DEFECTO} puntos`,
          }}
          className="stagger-4 animate-fade-slide-in"
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Weekly Activity Chart — 2 columns */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-5 animate-fade-slide-in">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">Actividad Semanal</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Recursos completados y entregas (últimos 7 días)</p>
              </div>
              <div className="flex gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS.primary }} /> Recursos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS.success }} /> Entregas
                </span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                <AreaChart data={weeklyActivity} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSesiones" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradEntregas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                      fontSize: '13px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sesiones"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2.5}
                    fill="url(#gradSesiones)"
                  />
                  <Area
                    type="monotone"
                    dataKey="entregas"
                    stroke={CHART_COLORS.success}
                    strokeWidth={2}
                    fill="url(#gradEntregas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Student Distribution Donut */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-6 animate-fade-slide-in">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-lg font-bold mb-1">Distribución por Curso</h2>
            <p className="text-xs text-muted-foreground mb-4">{totalMatriculas} matrículas totales</p>
            {courseDistribution.length > 0 ? (
              <>
                <div className="h-52 flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <PieChart>
                      <Pie
                        data={courseDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="hsl(var(--card))"
                        strokeWidth={3}
                      >
                        {courseDistribution.map((entry: any, i: number) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          fontSize: '13px',
                        }}
                        formatter={(value: any, name: any) => [`${value} estudiantes`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label as HTML overlay — avoids SVG text issues with dynamic imports */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-foreground">{totalMatriculas}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">matrículas</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="space-y-2 mt-4">
                  {courseDistribution.map((c: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs group/item hover:bg-muted/30 rounded-lg px-2 py-1 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="font-medium text-foreground">{c.name}</span>
                      </div>
                      <span className="font-bold text-muted-foreground group-hover/item:text-foreground transition-colors">
                        {c.value}{' '}
                        <span className="font-normal">
                          ({totalMatriculas > 0 ? Math.round((c.value / totalMatriculas) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BookOpen className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">Sin cursos publicados aún</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
