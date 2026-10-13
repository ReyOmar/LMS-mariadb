'use client';

import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { CourseCatalog } from '@/components/features/CourseCatalog';
import type { Course } from '@/types/models';
import { useCourseCatalog } from '../useCourseCatalog';
import { NoCourses } from './NoCourses';
import { builderUrl } from './paths';

/** Catálogo del administrador: abrir un curso o crear uno nuevo. */
export function CourseCatalogView() {
  const router = useRouter();
  const { user } = useSession();
  const { showAlert } = useAlerts();
  const catalog = useCourseCatalog();
  const creating = useInFlight<'course'>();

  const createCourse = () =>
    void creating.run('course', async () => {
      try {
        const { data } = await api.post<Course>('/courses', { title: 'Curso nuevo', teacherGuid: user?.guid });
        router.push(builderUrl(data.guid));
      } catch (error) {
        showAlert.error('No se pudo crear el curso', errorMessage(error));
      }
    });

  if (!catalog.courses) {
    return catalog.error ? (
      <LoadFailed message={catalog.error} onRetry={() => void catalog.retry()} />
    ) : (
      <PageLoader message="Cargando cursos..." />
    );
  }

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Gestión de cursos
        </h1>
        <p className="text-muted-foreground mt-1">Crea los cursos y organízalos en módulos y recursos.</p>
      </header>

      {catalog.courses.length === 0 ? (
        <NoCourses onCreate={createCourse} />
      ) : (
        <CourseCatalog
          courses={catalog.courses}
          onCreate={createCourse}
          onOpen={(course) => router.push(builderUrl(course.guid))}
        />
      )}
    </div>
  );
}
