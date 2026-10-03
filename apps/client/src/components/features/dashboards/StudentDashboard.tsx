'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, BookOpen, Clock, GraduationCap, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useRealtime, useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { HighlightedStat } from '@/components/ui/HighlightedStat';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage } from '@/lib/api';
import type { Course, StudentMetrics } from '@/types/models';
import { useAlerts } from '@/contexts/AlertContext';
import { plural } from '@/lib/text';
import { calendarDay } from '@/lib/dates';

const MONTH_NAMES = [
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
const DAY_NAMES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

export function StudentDashboard() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const { coursesUnderMaintenance: maintenance } = useRealtime();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [metrics, setMetrics] = useState<StudentMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Mes que se está mirando en el calendario de actividad; al abrir, el de hoy en la sede.
  const [calendarDate, setCalendarDate] = useState(() => {
    const { year, month } = calendarDay();
    return new Date(year, month, 1);
  });
  const [activeDays, setActiveDays] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    try {
      // Cada curso trae ya su avance: no hace falta pedirlo curso a curso.
      const [coursesRes, metricsRes] = await Promise.all([
        api.get<Course[]>('/courses'),
        api.get<StudentMetrics>('/students/metrics'),
      ]);
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : []);
      setMetrics(metricsRes.data);
    } catch (error) {
      notify.error('No se pudo cargar tu tablero', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user?.guid) void loadData();
  }, [user?.guid, loadData]);

  // El tablero se refresca cuando cambia algo que le afecta directamente.
  useRealtimeEvent('submission:graded', loadData);
  useRealtimeEvent('enrollment:changed', loadData);
  useRealtimeEvent('course:updated', loadData);
  useRealtimeEvent('course:deleted', loadData);
  useRealtimeEvent('course:maintenance', loadData);
  useRealtimeEvent('certificate:new', loadData);
  useRealtimeReconnect(loadData);

  // Un curso está terminado cuando lo está su vuelta actual: el certificado de una vuelta
  // anterior no cuenta para quien lo está repitiendo.
  const finished = (course: Course) => Boolean(course.completedAt);

  // Cursos que se pueden hacer ahora: publicados, sin mantenimiento y sin terminar.
  const activeCourses = courses.filter((c) => c.status === 'PUBLISHED' && !maintenance[c.guid] && !finished(c));

  // Cursos asignados que ahora mismo están en mantenimiento y aún sin completar.
  const coursesUnderMaintenance = courses.filter((c) => (c.status === 'DRAFT' || maintenance[c.guid]) && !finished(c));

  // Todo lo que al alumno le queda por terminar, esté el curso como esté.
  const incompleteCourses = courses.filter((c) => !finished(c));

  const lastCourse = activeCourses.length > 0 ? activeCourses[0] : null;
  const hasMaintenance = coursesUnderMaintenance.length > 0;
  const allCoursesCompleted = courses.length > 0 && incompleteCourses.length === 0;
  const totalCourses = metrics?.totalCourses ?? courses.length;
  const moduleCount = lastCourse?._count?.modules ?? 0;
  const progress = {
    completed: lastCourse?.completedResources ?? 0,
    total: lastCourse?.totalResources ?? 0,
    percent: lastCourse?.percent ?? 0,
  };

  // Lo que explica la cifra de cursos activos cuando es cero o hay alguno parado.
  const activeDetail = hasMaintenance
    ? { text: `${coursesUnderMaintenance.length} en mantenimiento`, tone: 'warning' as const }
    : allCoursesCompleted
      ? { text: 'Todos completados', tone: 'success' as const }
      : courses.length === 0
        ? { text: 'Sin cursos asignados' }
        : undefined;

  // Calendario
  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 = domingo
  const today = calendarDay();

  const previousMonth = () => setCalendarDate(new Date(calendarYear, calendarMonth - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calendarYear, calendarMonth + 1, 1));

  // Días con actividad del mes que se esté mirando en el calendario.
  useEffect(() => {
    if (!user?.guid) return;
    let current = true;
    setActiveDays([]); // Se vacía ya, para no enseñar un instante los días del mes anterior.
    api
      .get<{ days: number[] }>('/students/active-days', { params: { year: calendarYear, month: calendarMonth } })
      .then(({ data }) => {
        // Al pasar de mes deprisa, sólo cuenta la respuesta del mes que está a la vista.
        if (current) setActiveDays(Array.isArray(data.days) ? data.days : []);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [user?.guid, calendarYear, calendarMonth]);

  if (loading) return <PageLoader message="Cargando tu tablero…" />;

  return (
    <div className="animate-fade-slide-in">
      {/* Cabecera */}
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground mb-1">Bienvenido de vuelta,</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.firstName || 'Estudiante'} 👋</h1>
      </header>

      {/* Rejilla principal: continuar aprendiendo y calendario */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Tarjeta de «continuar aprendiendo» */}
        <div className="lg:col-span-2 bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-primary-foreground shadow-lg flex flex-col md:flex-row gap-6 items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />

          <div className="flex-1 z-10">
            {lastCourse ? (
              <>
                <span className="inline-block px-3 py-1 bg-primary-foreground/20 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 border border-primary-foreground/10 text-primary-foreground/90 backdrop-blur-sm">
                  Continuar aprendiendo
                </span>
                <h2 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">{lastCourse.title}</h2>
                <p className="text-primary-foreground/70 mb-6">
                  {moduleCount} {plural(moduleCount, 'módulo', 'módulos')} · {progress.completed}/{progress.total}{' '}
                  {plural(progress.total, 'recurso completado', 'recursos completados')}
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/courses/${lastCourse.guid}`)}
                  className="flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
                >
                  <Play className="h-4 w-4 fill-primary" /> Retomar curso
                </button>
              </>
            ) : hasMaintenance && !allCoursesCompleted ? (
              <>
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> Curso en mantenimiento
                </h2>
                <p className="text-primary-foreground/70 mb-4">
                  {coursesUnderMaintenance.length === 1
                    ? 'Tu curso activo está temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.'
                    : `Tus ${coursesUnderMaintenance.length} cursos activos están temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.`}
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
                  type="button"
                  onClick={() => router.push('/dashboard/student/certificates')}
                  className="flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
                >
                  <GraduationCap className="h-4 w-4" /> Ver mis certificados
                </button>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">Sin cursos asignados</h2>
                <p className="text-primary-foreground/70">Contacta con tu administrador para que te asigne cursos.</p>
              </>
            )}
          </div>

          {/* Anillo de progreso */}
          {lastCourse && (
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
                  strokeDashoffset={251.2 * (1 - progress.percent / 100)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-white">
                <span className="text-xl font-bold">{progress.percent}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Calendario */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={previousMonth}
              aria-label="Mes anterior"
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h3 className="font-bold text-sm">
              {MONTH_NAMES[calendarMonth]} {calendarYear}
            </h3>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mes siguiente"
              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-[10px] font-bold text-muted-foreground uppercase py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = calendarYear === today.year && calendarMonth === today.month && day === today.day;
              const isActive = activeDays.includes(day);
              return (
                <div
                  key={day}
                  className={`relative text-xs font-medium py-1.5 rounded-lg transition-colors ${
                    isToday
                      ? 'bg-primary text-primary-foreground font-bold'
                      : isActive
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
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

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HighlightedStat
          label="Horas en capacitación"
          value={Math.round(Number(metrics?.totalHoursSpent ?? 0) * 10) / 10}
          suffix="h"
          icon={<Clock className="h-5 w-5" />}
          color="info"
          className="stagger-5 animate-fade-slide-in"
        />
        <HighlightedStat
          label="Cursos completados"
          value={metrics?.completedCourses ?? 0}
          detail={
            totalCourses > 0
              ? { text: `de ${totalCourses} ${plural(totalCourses, 'asignado', 'asignados')}` }
              : undefined
          }
          icon={<GraduationCap className="h-5 w-5" />}
          color="success"
          className="stagger-6 animate-fade-slide-in"
        />
        <HighlightedStat
          label="Cursos activos"
          value={activeCourses.length}
          detail={activeDetail}
          icon={<BookOpen className="h-5 w-5" />}
          color="primary"
          className="stagger-7 animate-fade-slide-in"
        />
      </div>
    </div>
  );
}
