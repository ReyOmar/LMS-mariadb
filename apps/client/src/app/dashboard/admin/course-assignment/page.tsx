'use client';

import { useEffect, useState } from 'react';
import { BookMarked, SearchX, Users } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useSession } from '@/contexts/SessionContext';
import { useCourseDirectory } from './useCourseDirectory';
import { CourseDirectory } from './components/CourseDirectory';
import { CoursePanel } from './components/CoursePanel';

/** Se llega con un curso ya elegido desde la ficha de un examinador; la URL se limpia al leerlo. */
function useCourseFromUrl(select: (guid: string) => void) {
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('course');
    if (!requested) return;
    window.history.replaceState(null, '', window.location.pathname);
    select(requested);
  }, [select]);
}

export default function CourseAssignmentPage() {
  const { user } = useSession();
  const directory = useCourseDirectory();
  const [selectedGuid, setSelectedGuid] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  useCourseFromUrl(setSelectedGuid);

  if (!directory.courses) {
    return directory.error ? (
      <LoadFailed message={directory.error} onRetry={() => void directory.retry()} />
    ) : (
      <PageLoader message="Preparando panel de asignaciones..." />
    );
  }

  const selectedCourse = directory.courses.find((course) => course.guid === selectedGuid);

  const unassign = () => {
    if (!selectedCourse || !user) return;
    const self = { guid: user.guid, firstName: user.firstName, lastName: user.lastName, role: 'ADMIN' as const };
    void directory.changeHolder(selectedCourse.guid, self, 'El curso vuelve a tu cargo');
  };

  return (
    <div className="animate-in fade-in duration-700 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookMarked className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Asignación y matrículas
        </h1>
        <p className="text-muted-foreground mt-1">
          Selecciona un curso para matricular estudiantes o asignar un examinador.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-14rem)] lg:h-[calc(100vh-14rem)]">
        <CourseDirectory
          courses={directory.courses}
          selectedGuid={selectedGuid}
          onSelect={setSelectedGuid}
          locked={batchRunning}
          className={selectedCourse ? 'hidden lg:flex' : 'flex'}
        />

        <div className="flex-1 bg-card border border-border shadow-sm rounded-3xl overflow-hidden flex flex-col relative">
          {selectedCourse ? (
            <CoursePanel
              key={selectedCourse.guid}
              course={selectedCourse}
              changingHolder={directory.isChangingHolder(selectedCourse.guid)}
              batchRunning={batchRunning}
              onBatchRunningChange={setBatchRunning}
              onBack={() => setSelectedGuid('')}
              onAssign={(examiner) =>
                void directory.changeHolder(
                  selectedCourse.guid,
                  { ...examiner, role: 'TEACHER' },
                  'Examinador asignado',
                )
              }
              onUnassign={unassign}
            />
          ) : (
            <NoCourseOpen missing={selectedGuid !== ''} />
          )}
        </div>
      </div>
    </div>
  );
}

/** `missing`: el curso pedido —por la URL o el que estaba abierto— ya no existe. */
function NoCourseOpen({ missing }: { missing: boolean }) {
  const Icon = missing ? SearchX : Users;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500">
      <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-primary opacity-50" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">
        {missing ? 'Ese curso ya no existe' : 'Selecciona un curso'}
      </h2>
      <p className="text-muted-foreground max-w-sm">
        {missing
          ? 'Se eliminó o el enlace no es correcto. Elige otro curso del directorio.'
          : 'Haz clic en uno de los cursos del directorio para matricular estudiantes o asignar a un examinador.'}
      </p>
    </div>
  );
}
