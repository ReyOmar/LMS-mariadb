'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCourseLock } from '@/hooks/useCourseLock';
import { CourseInUseAlert } from '@/app/dashboard/course-builder/components/Notices';
import { builderUrl } from '@/app/dashboard/course-builder/components/paths';
import { editorTarget } from './resource-form';
import { useEditorCourse } from './useEditorCourse';
import { ResourceEditor } from './components/ResourceEditor';

interface Props {
  params: Promise<{ courseId: string; moduleId: string; resourceId: string }>;
  /** `type`: el tipo de un recurso nuevo, que se crea al guardarlo. */
  searchParams: Promise<{ type?: string }>;
}

export default function ResourceEditorPage({ params, searchParams }: Props) {
  const { courseId, moduleId, resourceId } = use(params);
  const { type } = use(searchParams);
  const router = useRouter();
  const { course, error, retry } = useEditorCourse(courseId);
  // Avisa a los demás de que este curso se está editando y lo libera al salir.
  const otherEditor = useCourseLock(courseId);

  if (!course) {
    return error ? (
      <LoadFailed message={error} onRetry={() => void retry()} />
    ) : (
      <PageLoader message="Cargando editor de contenido..." />
    );
  }

  const target = editorTarget(course, moduleId, resourceId, type);

  return (
    <>
      {target ? (
        <ResourceEditor key={resourceId} course={course} moduleGuid={moduleId} target={target} />
      ) : (
        <EmptyState
          title="Recurso no encontrado"
          description="Puede que se haya eliminado. Vuelve al curso para ver su temario actual."
          action={
            <button
              type="button"
              onClick={() => router.push(builderUrl(courseId))}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Volver al curso
            </button>
          }
        />
      )}

      {otherEditor && (
        <CourseInUseAlert
          courseTitle={course.title}
          editor={otherEditor}
          exitText="Volver al apartado"
          note="Debes salir para no sobrescribir sus cambios."
          onExit={() => router.push(builderUrl(courseId))}
        />
      )}
    </>
  );
}
