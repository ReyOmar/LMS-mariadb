'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Presentation } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useAlerts } from '@/contexts/AlertContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { CourseCatalog } from '@/components/features/CourseCatalog';
import api, { errorMessage } from '@/lib/api';
import type { Course } from '@/types/models';

export function ExaminerDashboard() {
  const { notify } = useAlerts();
  const { user } = useSession();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

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
        <CourseCatalog
          courses={courses}
          onOpen={(course) => router.push(`/dashboard/course-builder?course=${course.guid}`)}
        />
      )}
    </div>
  );
}
