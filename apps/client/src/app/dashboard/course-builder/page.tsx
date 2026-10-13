'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { CourseCatalogView } from './components/CourseCatalogView';
import { CourseWorkspace } from './components/CourseWorkspace';
import { selectionFromAddress } from './components/selection';

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
  // El examinador no tiene catálogo: llega siempre desde su tablero con el curso en la dirección.
  const sendToDashboard = role === 'teacher' && !courseGuid;

  useEffect(() => {
    if (sendToDashboard) router.replace('/dashboard');
  }, [sendToDashboard, router]);

  if (sendToDashboard) return <PageLoader message="Volviendo a tus asignaciones..." />;
  if (!courseGuid) return <CourseCatalogView />;

  return (
    <CourseWorkspace
      key={courseGuid}
      courseGuid={courseGuid}
      initialSelection={selectionFromAddress(searchParams.get('module'), searchParams.get('resource'))}
    />
  );
}
