'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BookOpen, Eye } from 'lucide-react';
import { loginUrl } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useSession } from '@/contexts/SessionContext';
import { useStudyTime } from '@/hooks/useStudyTime';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import type { Resource } from '@/types/models';
import {
  buildSyllabus,
  findEntry,
  isOnlyAwaitingGrades,
  isPathCompleted,
  moduleStart,
  pathProgressFrom,
  resumeEntry,
} from './components/progression';
import { Celebration, CourseAlreadyEnded, CourseUnderMaintenance, UngradedAssignments } from './components/Notices';
import { CourseTopBar } from './components/CourseTopBar';
import { Syllabus } from './components/Syllabus';
import { ResourceView } from './components/ResourceView';
import { useCourseContent } from './useCourseContent';
import { useCourseRound } from './useCourseRound';
import { useSyllabusPanel } from './useSyllabusPanel';

/**
 * El visor es del alumno matriculado: registra su tiempo de estudio y su avance. El personal
 * (administración y examinadores) revisa el curso en la vista previa del constructor.
 */
export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { ready, authenticated, role } = useSession();
  const { notify } = useAlerts();
  const redirected = useRef(false);
  const staff = authenticated && role !== 'student';

  useEffect(() => {
    if (!ready || redirected.current) return;
    if (!authenticated) {
      redirected.current = true;
      // Tras entrar vuelve aquí: el enlace del correo de matrícula no se pierde.
      router.replace(loginUrl(undefined, `/courses/${courseId}`));
    } else if (staff) {
      redirected.current = true;
      notify.info(
        'Vista previa del curso',
        'Ese enlace es el del alumno matriculado. Desde aquí puedes revisar el curso.',
      );
      router.replace(`/dashboard/course-builder?course=${courseId}`);
    }
  }, [ready, authenticated, staff, courseId, notify, router]);

  if (!ready || !authenticated) return <PageLoader message="Comprobando tu sesión…" />;
  if (staff) return <PageLoader message="Abriendo la vista previa…" />;
  return <CourseViewer courseId={courseId} />;
}

function CourseViewer({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { showConfirmation } = useAlerts();
  const content = useCourseContent(courseId);
  const panel = useSyllabusPanel();
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [quizInProgress, setQuizInProgress] = useState(false);
  const { course, progress } = content;

  const syllabus = useMemo(
    () =>
      course && progress
        ? buildSyllabus(course.modules ?? [], pathProgressFrom(progress), course.strictOrder ?? true)
        : null,
    [course, progress],
  );

  const round = useCourseRound(courseId, {
    pathCompleted: syllabus && isPathCompleted(syllabus),
    onlyAwaitingGrades: syllabus !== null && isOnlyAwaitingGrades(syllabus),
    quizInProgress,
  });
  const readOnly = round.stage === 'reviewing';

  // Tiempo dedicado al curso: cuenta mientras se hace, no en mantenimiento ni al repasarlo terminado.
  const studying = round.stage === 'studying' && course?.status === 'PUBLISHED' && !content.leaving;
  useStudyTime(courseId, studying);

  useLeaveGuard(quizInProgress, {
    warning: 'Tienes un cuestionario en curso. ¿Salir igualmente?',
    onLeave: async (destination) => {
      const confirmed = await showConfirmation(
        'Cuestionario en curso',
        'El tiempo del intento sigue corriendo aunque salgas. Tus respuestas quedan guardadas en este navegador.',
        'Salir',
        'warning',
      );
      if (confirmed) router.push(destination);
    },
  });

  // Se abre por donde se quedó, y vuelve ahí si lo elegido desaparece o se cierra.
  const selected = syllabus && findEntry(syllabus, selectedGuid);
  const current = selected?.open ? selected : syllabus && resumeEntry(syllabus);
  const currentGuid = current?.resource.guid ?? null;
  // Lo que se ve queda elegido: completarlo no salta solo al siguiente recurso.
  useEffect(() => setSelectedGuid(currentGuid), [currentGuid]);

  if (content.leaving) return <PageLoader message="Volviendo a tus cursos…" />;
  if (content.loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <LoadFailed message={content.loadError} onRetry={content.retry} />
      </div>
    );
  }
  if (!course || !syllabus || round.stage === 'checking') return <PageLoader message="Cargando contenido del curso…" />;
  if (course.status !== 'PUBLISHED') return <CourseUnderMaintenance title={course.title} />;
  if (round.stage === 'already-finished') {
    return (
      <CourseAlreadyEnded
        title={course.title}
        onViewOnly={round.review}
        onViewCertificate={() => router.push(round.certificatesUrl)}
      />
    );
  }

  const select = (resource: Resource) => {
    setSelectedGuid(resource.guid);
    panel.closeIfNarrow();
  };

  const onQuizFinished = async (quizGuid: string, passed: boolean) => {
    await content.refreshProgress();
    // Suspender devuelve al principio del módulo, para repasarlo antes de repetir.
    if (!passed) setSelectedGuid(moduleStart(syllabus, quizGuid)?.guid ?? quizGuid);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {readOnly && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-sm shrink-0">
          <span className="flex items-center gap-2 text-primary font-medium">
            <Eye className="h-4 w-4" /> Modo de solo lectura: este curso ya fue completado
          </span>
          <Link
            href={round.certificatesUrl}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-3 py-1 rounded-lg transition-colors"
          >
            Ver certificado
          </Link>
        </div>
      )}

      {!quizInProgress && (
        <CourseTopBar title={course.title} syllabusOpen={panel.open} onToggleSyllabus={panel.toggle} />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {!quizInProgress && (
          <Syllabus
            syllabus={syllabus}
            currentGuid={currentGuid}
            floating={panel.narrow}
            open={panel.open}
            onClose={panel.close}
            onSelect={select}
          />
        )}

        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {current ? (
            <ResourceView
              resource={current.resource}
              passingScore={course.passingScore}
              completed={current.completed}
              readOnly={readOnly}
              marking={content.isMarking(current.resource.guid)}
              onMarkCompleted={() => void content.markCompleted(current.resource.guid)}
              onAssignmentChanged={() => void content.refreshProgress()}
              onQuizFinished={(passed) => void onQuizFinished(current.resource.guid, passed)}
              onQuizStateChange={setQuizInProgress}
              onAccessError={content.handleAccessError}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
              <BookOpen className="h-20 w-20 mb-6 opacity-40" />
              <h2 className="text-xl font-bold mb-2">Este curso todavía no tiene contenido</h2>
              <p className="max-w-sm">Cuando el examinador publique sus recursos aparecerán en el temario.</p>
            </div>
          )}
        </main>
      </div>

      {round.stage === 'celebrating' && (
        <Celebration
          title={course.title}
          onKeepGoing={round.review}
          onViewCertificate={() => {
            round.review();
            router.push(round.certificatesUrl);
          }}
        />
      )}

      {round.ungradedNoticeOpen && progress && (
        <UngradedAssignments
          assignments={progress.pendingAssignments}
          onAcknowledge={round.acknowledgeUngraded}
          onGoToMessages={() => {
            round.acknowledgeUngraded();
            router.push('/dashboard/messages');
          }}
        />
      )}
    </div>
  );
}
