'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Play,
  BookOpen,
  Clock,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/contexts/RoleContext';
import { useRealtime, useEventoRealtime } from '@/contexts/RealtimeContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import api from '@/lib/api';

export function StudentDashboard() {
  const { user } = useRole();
  const { cursosEnMantenimiento: mantenimiento } = useRealtime();
  const router = useRouter();

  const [cursos, setCursos] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progreso, setProgreso] = useState<{ completados: number; total: number }>({ completados: 0, total: 0 });
  const [completedCourseGuids, setCompletedCourseGuids] = useState<Set<string>>(new Set());

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [activeDays, setActiveDays] = useState<number[]>([]);


  const fetchData = useCallback(async () => {
    try {
      const [cursosRes, metricasRes, certsRes] = await Promise.all([
        api.get('/cursos'),
        api.get('/estudiantes/metricas'),
        api.get('/certificados'),
      ]);

      const cursosArr = Array.isArray(cursosRes.data) ? cursosRes.data : [];
      const certs = Array.isArray(certsRes.data) ? certsRes.data : [];

      setCursos(cursosArr);
      setMetricas(metricasRes.data);
      setCompletedCourseGuids(new Set(certs.map((c: any) => c.curso_guid)));

      // Progreso del primer curso que todavía no esté certificado.
      const certificados = new Set(certs.map((c: any) => c.curso_guid));
      const siguiente =
        cursosArr.find((c: any) => c.estado === 'PUBLICADO' && !certificados.has(c.guid)) ?? cursosArr[0];

      if (siguiente) {
        const { data } = await api.get(`/estudiantes/progreso/${siguiente.guid}`);
        setProgreso({ completados: data.completados?.length ?? 0, total: data.total_recursos ?? 0 });
      }
    } catch (error) {
      console.error('No se pudo cargar el tablero del alumno', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchData();
  }, [user?.guid, fetchData]);

  // El tablero se refresca cuando cambia algo que le afecta directamente.
  useEventoRealtime('submission:graded', fetchData);
  useEventoRealtime('enrollment:changed', fetchData);
  useEventoRealtime('course:updated', fetchData);
  useEventoRealtime('course:maintenance', fetchData);
  useEventoRealtime('certificate:new', fetchData);

  // Pick next active (non-completed, non-maintenance) course
  const activeCursos = cursos.filter(
    (c) => c.estado === 'PUBLICADO' && !mantenimiento[c.guid] && !completedCourseGuids.has(c.guid),
  );

  // Courses assigned but in maintenance (BORRADOR or WS-flagged maintenance) and NOT completed
  const cursosEnMantenimiento = cursos.filter(
    (c) => (c.estado === 'BORRADOR' || mantenimiento[c.guid]) && !completedCourseGuids.has(c.guid),
  );

  // All courses that the student hasn't completed yet (regardless of state)
  const cursosNoCompletados = cursos.filter((c) => !completedCourseGuids.has(c.guid));

  const lastCurso = activeCursos.length > 0 ? activeCursos[0] : null;
  const hayMantenimiento = cursosEnMantenimiento.length > 0;
  const allCoursesCompleted = cursos.length > 0 && cursosNoCompletados.length === 0;

  // --- Calendar helpers ---
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const today = new Date();
  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

  const prevMonth = () => setCalendarDate(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calYear, calMonth + 1, 1));

  // Fetch active days when calendar month changes
  useEffect(() => {
    if (user?.guid) {
      setActiveDays([]); // Clear immediately to prevent stale data flash
      api
        .get('/estudiantes/dias-activos', { params: { year: calYear, month: calMonth } })
        .then((r) => r.data)
        .then((data) => setActiveDays(Array.isArray(data.dias) ? data.dias : []))
        .catch(() => setActiveDays([]));
    }
  }, [user?.guid, calYear, calMonth]);

  if (loading) {
    return (
      <div className="animate-fade-slide-in">
        <div className="mb-8">
          <div className="h-4 w-32 rounded bg-muted animate-shimmer mb-2" />
          <div className="h-8 w-44 rounded-lg bg-muted animate-shimmer mb-1" />
          <div className="h-4 w-60 rounded bg-muted animate-shimmer" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="h-5 w-40 rounded bg-muted animate-shimmer" />
            <div className="h-32 rounded-xl bg-muted/50 animate-shimmer" />
          </div>
          <div className="rounded-2xl border border-border/50 p-6">
            <div className="h-5 w-24 rounded bg-muted animate-shimmer mb-4" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded bg-muted/40 animate-shimmer"
                  style={{ animationDelay: `${i * 20}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border/50 p-5 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-muted animate-shimmer" />
              <div className="h-7 w-16 rounded bg-muted animate-shimmer" />
              <div className="h-3 w-24 rounded bg-muted animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-slide-in">
      {/* Header */}
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground mb-1">Bienvenido de vuelta,</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.nombre || 'Estudiante'} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Tu espacio de capacitación y formación.</p>
      </header>

      {/* Main Grid: Continue Learning + Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Continue Learning Widget */}
        <div className="lg:col-span-2 bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-primary-foreground shadow-lg flex flex-col md:flex-row gap-6 items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />

          <div className="flex-1 z-10">
            <span className="inline-block px-3 py-1 bg-primary-foreground/20 rounded-full text-xs font-semibold tracking-wider mb-4 border border-primary-foreground/10 text-primary-foreground/90 backdrop-blur-sm">
              CONTINUAR APRENDIENDO
            </span>
            {lastCurso ? (
              <>
                <h2 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">{lastCurso.titulo}</h2>
                <p className="text-primary-foreground/70 mb-6">
                  {lastCurso.modulos?.length || 0} módulos · {progreso.completados}/{progreso.total} recursos
                  completados
                </p>
                <button
                  onClick={() => router.push(`/cursos/${lastCurso.guid}`)}
                  className="flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
                >
                  <Play className="h-4 w-4 fill-primary" /> Retomar Curso
                </button>
              </>
            ) : hayMantenimiento && !allCoursesCompleted ? (
              <>
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> Curso en Mantenimiento
                </h2>
                <p className="text-primary-foreground/70 mb-4">
                  {cursosEnMantenimiento.length === 1
                    ? 'Tu curso activo está temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.'
                    : `Tus ${cursosEnMantenimiento.length} cursos activos están temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.`}
                </p>
                <div className="flex items-center gap-2 bg-primary-foreground/10 border border-primary-foreground/20 px-4 py-2.5 rounded-xl text-sm font-bold text-primary-foreground/80">
                  <Clock className="h-4 w-4" /> Volverán a estar disponibles pronto
                </div>
              </>
            ) : allCoursesCompleted ? (
              <>
                <h2 className="text-2xl font-bold mb-2">🎉 ¡Todos tus cursos completados!</h2>
                <p className="text-primary-foreground/70 mb-4">
                  Has finalizado todos los cursos asignados. Pronto tendrás nuevos cursos disponibles.
                </p>
                <button
                  onClick={() => router.push('/dashboard/student/certificados')}
                  className="flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
                >
                  <GraduationCap className="h-4 w-4" /> Ver Mis Certificados
                </button>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">Sin cursos asignados</h2>
                <p className="text-primary-foreground/70">Contacta con tu administrador para que te asigne cursos.</p>
              </>
            )}
          </div>

          {/* Progress Ring */}
          {lastCurso && (
            <div className="relative w-28 h-28 shrink-0 z-10 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-primary-foreground/20" strokeWidth="8" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-white"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 * (1 - (progreso.total > 0 ? progreso.completados / progreso.total : 0))}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-white">
                <span className="text-xl font-bold">
                  {progreso.total > 0 ? Math.round((progreso.completados / progreso.total) * 100) : 0}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h3 className="font-bold text-sm">
              {monthNames[calMonth]} {calYear}
            </h3>
            <button onClick={nextMonth} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {dayNames.map((d) => (
              <div key={d} className="text-[10px] font-bold text-muted-foreground uppercase py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday =
                calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
              const isActive = activeDays.includes(day);
              return (
                <div
                  key={day}
                  className={`relative text-xs font-medium py-1.5 rounded-lg transition-colors ${
                    isToday
                      ? 'bg-primary text-primary-foreground font-bold'
                      : isActive
                        ? 'bg-emerald-500/10 text-emerald-600 font-bold'
                        : 'text-foreground hover:bg-muted/50'
                  }`}
                  title={isActive ? 'Día con actividad' : undefined}
                >
                  {day}
                  {isActive && (
                    <span
                      className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${isToday ? 'bg-primary-foreground' : 'bg-emerald-500'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Horas en Capacitación"
          value={Math.round(Number(metricas?.total_horas_invertidas || 0) * 10) / 10}
          suffix="h"
          icon={<Clock className="h-5 w-5" />}
          color="info"
          className="stagger-5 animate-fade-slide-in"
        />
        <StatCard
          label="Cursos Completados"
          value={metricas?.cursos_completados || 0}
          suffix={`/${metricas?.total_cursos || cursos.length}`}
          icon={<GraduationCap className="h-5 w-5" />}
          color="success"
          className="stagger-6 animate-fade-slide-in"
        />
        <StatCard
          label="Cursos Activos"
          value={activeCursos.length}
          suffix={`/${cursos.length}`}
          icon={<BookOpen className="h-5 w-5" />}
          color="primary"
          className="stagger-7 animate-fade-slide-in"
        />
      </div>
    </div>
  );
}
