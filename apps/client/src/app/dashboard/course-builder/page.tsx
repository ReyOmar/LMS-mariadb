'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { CourseCatalogView } from './components/CourseCatalogView';
import { CourseWorkspace } from './components/CourseWorkspace';
import { selectionFromAddress } from './components/selection';
import { ASSIGNMENTS_PATH } from './components/paths';

/** Constructor de cursos: el catálogo o, con `?course=` en la dirección, el curso abierto. */
export default function CourseBuilderPage() {
  // `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página.
  return (
    <Suspense fallback={<PageLoader message="Cargando cursos..." />}>
      <CourseBuilder />
    </Suspense>
  );
}

function CourseBuilder() {
  const { role } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseGuid = searchParams?.get('course');
  // El examinador no ve el catálogo de la sede: llega desde «Mis asignaciones» con el curso en la dirección.
  const sendToAssignments = role === 'teacher' && !courseGuid;

  useEffect(() => {
    if (sendToAssignments) router.replace(ASSIGNMENTS_PATH);
  }, [sendToAssignments, router]);

  if (sendToAssignments) return <PageLoader message="Volviendo a tus asignaciones..." />;
  if (!courseGuid) return <CourseCatalogView />;

  return (
    <CourseWorkspace
      key={courseGuid}
      courseGuid={courseGuid}
      initialSelection={selectionFromAddress(searchParams.get('module'), searchParams.get('resource'))}
    />
  );
}
