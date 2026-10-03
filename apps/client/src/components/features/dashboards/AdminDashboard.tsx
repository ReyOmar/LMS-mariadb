'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Users, GraduationCap, AlertCircle } from 'lucide-react';
import { HighlightedStat } from '@/components/ui/HighlightedStat';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { plural } from '@/lib/text';
import { DEFAULT_PASSING_SCORE, formatPoints } from '@/lib/grading';
import type { CountrySummary } from '@/types/models';
import { Donut, ActivityAreas, breakdownColor } from '@/components/ui/charts';

/** Colores de las dos series de la actividad semanal, los mismos en la leyenda y en la gráfica. */
const ACTIVITY_COLORS = {
  resources: 'hsl(207, 80%, 42%)',
  submissions: 'hsl(152, 60%, 40%)',
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function averageLabel(average: number | null): string {
  if (average === null) return 'Todavía sin calificaciones';
  if (average >= 90) return 'Rendimiento excelente';
  return average >= DEFAULT_PASSING_SCORE
    ? `Por encima del umbral de ${DEFAULT_PASSING_SCORE} puntos`
    : `Por debajo del umbral de ${DEFAULT_PASSING_SCORE} puntos`;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useSession();
  const { notify } = useAlerts();
  const { name: countryName, country } = useCountry();

  const loadDashboardData = useCallback(async () => {
    const summary = await api
      .get<CountrySummary>('/dashboards/admin')
      .then((response) => response.data)
      .catch((error: unknown) => {
        notify.error('No se pudo cargar el panel de la sede', errorMessage(error));
        return null;
      });

    setStats(summary);
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useRealtimeEvent('request:new', loadDashboardData);
  useRealtimeEvent('request:resolved', loadDashboardData);
  useRealtimeEvent('enrollment:changed', loadDashboardData);

  const pendingRequests = stats?.pendingRequests ?? 0;

  // La API devuelve actividad y reparto sin color; la presentación la pone el cliente.
  // `name` es la clave que las gráficas usan para el eje horizontal.
  const weeklyActivity = (stats?.weeklyActivity ?? []).map((day) => ({
    name: day.day,
    resources: day.resources,
    submissions: day.submissions,
  }));
  const breakdownByCourse = (stats?.courseBreakdown ?? []).map((course, index) => ({
    guid: course.guid,
    name: course.name,
    value: course.enrollments,
    color: breakdownColor(index),
  }));
  const totalEnrollments = stats?.totalEnrollments ?? 0;
  const average = stats?.overallAverage ?? null;
  const users = stats?.users;
  const courses = stats?.courses;
  const students = users?.students ?? 0;
  const teachers = users?.teachers ?? 0;
  const published = courses?.published ?? 0;
  const drafts = courses?.draft ?? 0;
  const count = (value: number) => formatNumber(value, country);

  if (loading) return <PageLoader message="Cargando panel de la sede…" />;

  return (
    <div className="animate-fade-slide-in">
      {/* ── Cabecera con el saludo ── */}
      <header className="mb-10">
        <p className="text-sm font-medium text-muted-foreground mb-1">{timeOfDayGreeting()},</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.firstName || 'Administrador'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Panel de control de la sede{countryName ? ` de ${countryName}` : ''}
        </p>
      </header>

      {/* ── Tarjetas de cifras ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <HighlightedStat
          label="Usuarios totales"
          value={users?.total ?? 0}
          icon={<Users className="h-5 w-5" />}
          color="primary"
          detail={{
            text: `${count(students)} ${plural(students, 'estudiante', 'estudiantes')} · ${count(teachers)} ${plural(teachers, 'examinador', 'examinadores')}`,
          }}
          href="/dashboard/admin/users"
          className="stagger-1 animate-fade-slide-in"
        />
        <HighlightedStat
          label="Cursos"
          value={published + drafts}
          icon={<BookOpen className="h-5 w-5" />}
          color="info"
          detail={{
            text: `${count(published)} ${plural(published, 'publicado', 'publicados')} · ${count(drafts)} en borrador`,
          }}
          href="/dashboard/course-builder"
          className="stagger-2 animate-fade-slide-in"
        />
        <HighlightedStat
          label="Solicitudes pendientes"
          value={pendingRequests}
          icon={<AlertCircle className="h-5 w-5" />}
          color={pendingRequests > 0 ? 'warning' : 'success'}
          detail={
            pendingRequests > 0
              ? { text: 'Requieren revisión', tone: 'warning' }
              : { text: 'Todo al día', tone: 'success' }
          }
          href="/dashboard/admin/access-requests"
          className="stagger-3 animate-fade-slide-in"
        />
        <HighlightedStat
          label="Calificación media"
          value={average === null ? 0 : Number(formatPoints(average))}
          suffix=" / 100"
          icon={<GraduationCap className="h-5 w-5" />}
          color="accent"
          detail={{
            text: averageLabel(average),
            tone: average === null ? 'neutral' : average >= DEFAULT_PASSING_SCORE ? 'success' : 'warning',
          }}
          className="stagger-4 animate-fade-slide-in"
        />
      </div>

      {/* ── Fila de gráficas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6 mb-10">
        {/* Gráfica de actividad semanal, a dos columnas */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-5 animate-fade-slide-in">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">Actividad semanal</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Recursos completados y entregas (últimos 7 días)</p>
              </div>
              <div className="flex gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLORS.resources }} />{' '}
                  Recursos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLORS.submissions }} />{' '}
                  Entregas
                </span>
              </div>
            </div>
            <div className="h-64">
              <ActivityAreas
                data={weeklyActivity}
                series={[
                  { dataKey: 'resources', label: 'Recursos', color: ACTIVITY_COLORS.resources },
                  { dataKey: 'submissions', label: 'Entregas', color: ACTIVITY_COLORS.submissions },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Anillo de reparto de alumnos */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-6 animate-fade-slide-in">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-lg font-bold mb-1">Distribución por curso</h2>
            <p className="text-xs text-muted-foreground mb-4">
              {count(totalEnrollments)} {plural(totalEnrollments, 'matrícula en total', 'matrículas en total')}
            </p>
            {breakdownByCourse.length > 0 ? (
              <>
                <div className="h-52 flex items-center justify-center relative">
                  <Donut data={breakdownByCourse} legend={false} />
                  {/* La cifra central va en HTML y no en el SVG: así hereda el tipo de
                      letra de la aplicación y se lee igual en ambos temas. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-foreground">{count(totalEnrollments)}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {plural(totalEnrollments, 'matrícula', 'matrículas')}
                    </span>
                  </div>
                </div>
                {/* Leyenda */}
                <div className="space-y-2 mt-4">
                  {breakdownByCourse.map((course) => (
                    <div
                      key={course.guid}
                      className="flex items-center justify-between text-xs group/item hover:bg-muted/30 rounded-lg px-2 py-1 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: course.color }} />
                        <span className="font-medium text-foreground">{course.name}</span>
                      </div>
                      <span className="font-bold text-muted-foreground group-hover/item:text-foreground transition-colors">
                        {count(course.value)}{' '}
                        <span className="font-normal">
                          ({totalEnrollments > 0 ? Math.round((course.value / totalEnrollments) * 100) : 0}%)
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
