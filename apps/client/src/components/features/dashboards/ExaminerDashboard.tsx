'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Lock, ArrowRight, Eye, EyeOff, Search, ChevronDown, Presentation } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent, useRealtime } from '@/contexts/RealtimeContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import api, { errorMessage, fileUrlFor } from '@/lib/api';
import type { Course, CourseStatus } from '@/types/models';
import { useAlerts } from '@/contexts/AlertContext';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { clickable } from '@/lib/clickable';
import { USER_ROLE_LABEL } from '@/lib/labels';

export function ExaminerDashboard() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const { coursesBeingEdited } = useRealtime();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourseStatus | 'all'>('all');

  const loadCourses = useCallback(async () => {
    try {
      const { data } = await api.get<Course[]>('/courses');
      setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      notify.error('No se pudieron cargar tus cursos', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user?.guid) void loadCourses();
  }, [user?.guid, loadCourses]);

  useRealtimeEvent('course:updated', loadCourses);
  useRealtimeEvent('course:created', loadCourses);
  useRealtimeEvent('course:deleted', loadCourses);

  if (loading) {
    return <PageLoader message="Cargando asignaciones..." />;
  }

  const normalizedSearch = search.toLowerCase();
  const visibleCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(normalizedSearch) &&
      (statusFilter === 'all' || course.status === statusFilter),
  );

  return (
    <div className="animate-fade-slide-in">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Presentation className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mis asignaciones
        </h1>
        <p className="text-muted-foreground mt-1">Cursos que tienes asignados para supervisar y evaluar.</p>
      </header>

      {courses.length === 0 ? (
        <EmptyState
          icon={<Lock className="h-10 w-10" />}
          title="Sin cursos asignados"
          description="Aún no tienes cursos asignados. Contacta con un administrador para que te asigne cursos para supervisar."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar curso asignado por título"
                placeholder="Buscar curso asignado por título..."
                className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
              />
            </div>
            <div className="relative w-full sm:w-[200px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CourseStatus | 'all')}
                aria-label="Filtrar por estado"
                className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
              >
                <option value="all">Todos los estados</option>
                <option value="PUBLISHED">Publicados</option>
                <option value="DRAFT">Borradores</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleCourses.map((course) => {
              const editorInfo = coursesBeingEdited[course.guid];
              const lockedByOther = editorInfo && editorInfo.guid !== user?.guid;

              return (
                <div
                  key={course.guid}
                  {...clickable(() => {
                    if (lockedByOther) return;
                    router.push(`/dashboard/course-builder?course=${course.guid}`);
                  }, 'link')}
                  aria-disabled={lockedByOther || undefined}
                  className={`flex flex-col bg-card border rounded-2xl overflow-hidden transition-all shadow-sm relative ${
                    lockedByOther
                      ? 'border-border/50 opacity-50 grayscale cursor-not-allowed'
                      : 'border-border/50 hover:border-primary/50 hover:shadow-md cursor-pointer group'
                  }`}
                >
                  {/* Capa de bloqueo */}
                  {lockedByOther && (
                    <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
                      <div className="bg-card/90 backdrop-blur-sm border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <Lock className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">En edición</p>
                          <p className="text-[11px] text-muted-foreground">
                            {USER_ROLE_LABEL[editorInfo.role]}: {editorInfo.name}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="h-32 bg-gradient-to-br from-primary/10 to-secondary/10 relative flex items-center justify-center overflow-hidden">
                    {course.coverImage ? (
                      <img
                        src={fileUrlFor(course.coverImage) ?? ''}
                        alt={course.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {course.title}
                    </h2>
                    <div className="flex justify-between items-center mt-auto pt-4 border-t border-border/30">
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                          course.status === 'PUBLISHED'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {course.status === 'PUBLISHED' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {COURSE_STATUS_LABEL[course.status]}
                      </div>
                      {lockedByOther ? (
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Bloqueado
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Administrar <ArrowRight className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {visibleCourses.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">
              Ningún curso asignado coincide con la búsqueda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
