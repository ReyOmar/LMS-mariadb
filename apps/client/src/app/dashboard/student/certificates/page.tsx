'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Award, Clock, Info } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { PageHeading } from '@/components/ui/PageHeading';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCertificates, type CourseAwaitingGrading } from './useCertificates';
import { CertificateCard } from './components/CertificateCard';
import { CertificateDetails } from './components/CertificateDetails';

const CERTIFICATES_PATH = '/dashboard/student/certificates';

// `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página.
export default function StudentCertificatesPage() {
  return (
    <Suspense fallback={<PageLoader message="Cargando tus certificados…" />}>
      <StudentCertificates />
    </Suspense>
  );
}

function StudentCertificates() {
  const router = useRouter();
  const requestedGuid = useSearchParams().get('open');
  const { certificates, awaitingGrading, loading, error, retry, download, isDownloading } = useCertificates();
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const selected = certificates.find((certificate) => certificate.guid === selectedGuid) ?? null;

  // `?open=<guid>` (desde el curso) abre esa ficha una vez y se quita de la dirección: si no,
  // volvería a abrirse sola al cerrarla.
  useEffect(() => {
    if (!requestedGuid || loading) return;
    setSelectedGuid(requestedGuid);
    router.replace(CERTIFICATES_PATH, { scroll: false });
  }, [requestedGuid, loading, router]);

  if (loading) return <PageLoader message="Cargando tus certificados…" />;

  return (
    <>
      <PageHeading
        eyebrow="Área de aprendizaje"
        title="Mis certificados"
        lead="Se emiten al aprobar un curso. Cualquiera puede comprobar que son auténticos con su código."
      />

      {error ? (
        <div className="mt-8">
          <LoadFailed message={error} onRetry={retry} />
        </div>
      ) : (
        <>
          {awaitingGrading.length > 0 && <AwaitingGrading courses={awaitingGrading} />}

          {certificates.length === 0 ? (
            <EmptyState
              className="mt-8 rounded-3xl border border-border/60 bg-card"
              icon={<Award className="h-10 w-10" />}
              title="Aún no tienes certificados"
              description="Se generan solos cuando completas un curso con la nota mínima. ¡Sigue avanzando en tus cursos!"
            />
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {certificates.map((certificate) => (
                <li key={certificate.guid}>
                  <CertificateCard
                    certificate={certificate}
                    downloading={isDownloading(certificate.guid)}
                    onOpen={() => setSelectedGuid(certificate.guid)}
                    onDownload={() => void download(certificate)}
                  />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 flex gap-3 rounded-2xl bg-primary/10 px-4 py-3.5 text-[13px] leading-relaxed text-primary">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              ¿Te falta un certificado? Se emite al aprobar todos los recursos del curso con la nota mínima. Si crees
              que hay un error, escríbele a tu examinador.
            </span>
          </p>
        </>
      )}

      {selected && (
        <CertificateDetails
          certificate={selected}
          onClose={() => setSelectedGuid(null)}
          onDownload={() => {
            void download(selected);
            setSelectedGuid(null);
          }}
        />
      )}
    </>
  );
}

function AwaitingGrading({ courses }: { courses: CourseAwaitingGrading[] }) {
  return (
    <ul className="mt-8 space-y-3">
      {courses.map((course) => (
        <li
          key={course.courseGuid}
          className="flex gap-3 rounded-2xl bg-amber-500/12 px-4 py-3.5 text-[13px] leading-relaxed text-amber-900 dark:text-amber-300"
        >
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>
              <b className="font-bold">{course.courseTitle}: esperando calificación.</b> Completaste todos los recursos;
              el certificado se emite solo cuando el examinador califique estas tareas:
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {course.pendingAssignments.map((assignment, index) => (
                <li
                  key={`${assignment.title}-${index}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-card/70 px-2.5 py-1 text-xs font-medium"
                >
                  <Clock className="h-3 w-3" /> {assignment.title}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
