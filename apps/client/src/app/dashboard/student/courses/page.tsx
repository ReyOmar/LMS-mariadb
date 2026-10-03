'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ArrowRight, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent, useRealtime } from '@/contexts/RealtimeContext';
import api, { errorMessage, fileUrlFor } from '@/lib/api';
import type { Course, CourseProgress } from '@/types/models';
import { useAlerts } from '@/contexts/AlertContext';
import { clickable } from '@/lib/clickable';

/** Etiqueta del pie de cada tarjeta; la misma forma que el estado en el panel del examinador. */
const BADGE =
  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm border';

export default function StudentCoursesPage() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  /** Porcentaje de avance de cada curso publicado, por su guid. */
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { coursesUnderMaintenance } = useRealtime();

  const loadCourses = useCallback(async () => {
    try {
      const { data } = await api.get<Course[]>('/courses');
      const list = Array.isArray(data) ? data : [];
      // Si falla el avance de un curso, su tarjeta se queda sin cifra, pero la lista se enseña.
      const entries = await Promise.all(
        list
          .filter((course) => course.status === 'PUBLISHED')
          .map((course) =>
            api
              .get<CourseProgress>(`/students/progress/${course.guid}`)
              .then(({ data: courseProgress }) => [course.guid, courseProgress.percent] as const)
              .catch(() => null),
          ),
      );
      setCourses(list);
      setProgress(Object.fromEntries(entries.filter((entry) => entry !== null)));
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
  useRealtimeEvent('course:maintenance', loadCourses);
  useRealtimeEvent('enrollment:changed', loadCourses);
  useRealtimeEvent('submission:graded', loadCourses);

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mis cursos
        </h1>
        <p className="text-muted-foreground mt-1">
          Estos son los cursos que te han sido asignados por tu administrador.
        </p>
      </header>

      {loading ? (
        <PageLoader message="Cargando tus cursos..." />
      ) : courses.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center shadow-sm">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold">Sin cursos asignados</h3>
          <p className="text-muted-foreground mt-2">
            No tienes cursos activos en este momento. Contacta con tu administrador.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const underMaintenance = !!coursesUnderMaintenance[course.guid] || course.status === 'DRAFT';
            const percent = progress[course.guid];
            return (
              <div
                key={course.guid}
                {...clickable(() => {
                  if (!underMaintenance) router.push(`/courses/${course.guid}`);
                }, 'link')}
                aria-disabled={underMaintenance || undefined}
                className={`bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative ${
                  underMaintenance
                    ? 'opacity-60 grayscale cursor-not-allowed'
                    : 'hover:shadow-md hover:border-primary/50 group cursor-pointer'
                }`}
              >
                {/* Capa de mantenimiento */}
                {underMaintenance && (
                  <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
                    <div className="bg-card/90 backdrop-blur-sm border border-amber-500/30 shadow-lg rounded-xl px-5 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">En mantenimiento</p>
                        <p className="text-[11px] text-muted-foreground">Vuelve más tarde</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="h-32 bg-primary/10 relative flex items-center justify-center overflow-hidden">
                  {course.coverImage ? (
                    <img
                      src={fileUrlFor(course.coverImage) ?? ''}
                      alt={course.title}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
                  )}
                  <div className="absolute inset-0 border-b border-border/30" />
                </div>
                <div className="p-5">
                  <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {course.title}
                  </h2>
                  <div className="flex justify-between items-center mt-6">
                    {underMaintenance ? (
                      <span
                        className={`${BADGE} bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20`}
                      >
                        <AlertTriangle className="h-3 w-3" /> Mantenimiento
                      </span>
                    ) : percent === 100 ? (
                      <span
                        className={`${BADGE} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20`}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Completado
                      </span>
                    ) : percent !== undefined ? (
                      <span className={`${BADGE} bg-primary/10 text-primary border-primary/20`}>
                        <TrendingUp className="h-3 w-3" /> {percent === 0 ? 'Sin empezar' : `${percent}% completado`}
                      </span>
                    ) : (
                      <span />
                    )}
                    {!underMaintenance && (
                      <span className="text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Entrar <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
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
