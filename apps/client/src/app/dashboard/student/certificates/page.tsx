'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Award, Clock, GraduationCap, Star } from 'lucide-react';
import { MAX_SCORE, averageScore } from '@/lib/grading';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import { HighlightedStat } from '@/components/ui/HighlightedStat';
import type { Certificate } from '@/types/models';
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
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Award className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mis certificados
        </h1>
        <p className="text-muted-foreground mt-2">
          Tus certificados de finalización de cursos. Descárgalos en formato PDF.
        </p>
      </header>

      {error ? (
        <LoadFailed message={error} onRetry={retry} />
      ) : (
        <>
          {certificates.length > 0 && <Summary certificates={certificates} />}
          {awaitingGrading.length > 0 && <AwaitingGrading courses={awaitingGrading} />}

          {certificates.length === 0 ? (
            <EmptyState
              className="bg-card border border-border/50 rounded-2xl"
              icon={<Award className="h-10 w-10" />}
              title="Aún no tienes certificados"
              description="Los certificados se generan automáticamente cuando completas todos los módulos de un curso. ¡Sigue avanzando en tus cursos activos!"
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </div>
  );
}

function Summary({ certificates }: { certificates: Certificate[] }) {
  const hours = Math.round(certificates.reduce((sum, certificate) => sum + certificate.hours, 0));
  const average = averageScore(certificates.map((certificate) => certificate.averageScore));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <HighlightedStat
        label="Certificados obtenidos"
        value={certificates.length}
        icon={<GraduationCap className="h-5 w-5" />}
        color="success"
      />
      <HighlightedStat
        label="Horas de capacitación"
        value={hours}
        suffix="h"
        icon={<Clock className="h-5 w-5" />}
        color="info"
      />
      {average !== null && (
        <HighlightedStat
          label="Promedio general"
          value={Math.round(average * 10) / 10}
          suffix={` / ${MAX_SCORE}`}
          icon={<Star className="h-5 w-5" />}
          color="warning"
        />
      )}
    </div>
  );
}

function AwaitingGrading({ courses }: { courses: CourseAwaitingGrading[] }) {
  return (
    <ul className="mb-8 space-y-3">
      {courses.map((course) => (
        <li
          key={course.courseGuid}
          className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-3"
        >
          <span className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-500" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm text-foreground mb-1">{course.courseTitle}: esperando calificación</h2>
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              Has completado todos los recursos de este curso. Tu certificado se generará automáticamente cuando el
              examinador califique estas tareas:
            </p>
            <ul className="flex flex-wrap gap-2">
              {course.pendingAssignments.map((assignment, index) => (
                <li
                  key={`${assignment.title}-${index}`}
                  className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium px-2.5 py-1 rounded-lg"
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
