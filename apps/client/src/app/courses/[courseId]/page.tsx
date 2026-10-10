'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Type,
  CheckCircle,
  Trophy,
  Lock,
  Image as ImageIcon,
  PlayCircle,
  Paperclip,
  ExternalLink,
  Clock,
  Eye,
  PanelLeftClose,
  PanelLeft,
  Layers,
  X,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import Link from 'next/link';
import api, { errorMessage, fileUrlFor, loginUrl } from '@/lib/api';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { useStudyTime } from '@/hooks/useStudyTime';
import { useAlerts } from '@/contexts/AlertContext';
import { useSession } from '@/contexts/SessionContext';
import { readLocal, writeLocal } from '@/lib/local-storage';
import { sanitizeHTML } from '@/lib/sanitize';
import QuizViewer from '@/components/quiz/QuizViewer';
import { clearQuizDraft } from '@/components/quiz/quiz-draft';
import AssignmentViewer from '@/components/assignments/AssignmentViewer';
import { isModuleOpen, whereToResume, isResourceOpen, lastResource } from './components/progression';
import { linkTarget, isQuiz, displayTitle, externalUrl } from '@/lib/resources';
import { ResourceTarget, resourceLabel } from '@/components/resources/ResourceTarget';
import { Celebration, CourseUnderMaintenance, CourseAlreadyEnded, UngradedAssignments } from './components/Notices';
import type { Certificate, Course, CourseModule, CourseProgress, Resource } from '@/types/models';
import { useInFlight } from '@/hooks/useInFlight';

/** Recuerda si el temario se dejó abierto. */
const SIDEBAR_KEY = 'lms_sidebar_open';

const MY_COURSES = '/dashboard/student/courses';

/**
 * La API negó el acceso (403) o no encontró lo pedido (404): el alumno fue dado de baja, el
 * curso pasó a mantenimiento o desapareció el curso o el recurso.
 */
function isAccessLost(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 403 || status === 404;
}

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
  return <CourseViewer />;
}

function CourseViewer() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<string[]>([]);
  const [currentResource, setCurrentResource] = useState<Resource | null>(null);
  const studentGuid = useSession().user?.guid ?? '';
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [underMaintenance, setUnderMaintenance] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCelebrationActions, setShowCelebrationActions] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<CourseProgress['pendingAssignments']>([]);
  const [showPendingAlert, setShowPendingAlert] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [showCourseFinished, setShowCourseFinished] = useState(false);
  const [certGuid, setCertGuid] = useState<string | null>(null);
  const [quizInProgress, setQuizInProgress] = useState(false);
  const [pendingCelebration, setPendingCelebration] = useState(false);
  /** El fin del curso ya se anunció: con la felicitación o con el aviso de curso terminado. */
  const celebrationShown = useRef(false);
  /** Ya se comprobó el avance una vez: lo que se termine a partir de ahí, se termina en esta visita. */
  const progressChecked = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const leftRef = useRef(false);
  const { showAlert, notify } = useAlerts();

  // Lo necesita `leaveCourse`, que se llama desde cargas memorizadas: con el estado a secas
  // vería el curso de cuando se creó la carga.
  const courseRef = useRef(course);
  courseRef.current = course;

  /**
   * Saca al alumno de un curso al que ya no tiene acceso: descarta todo lo cargado, borra
   * los borradores de sus cuestionarios y lo devuelve a su lista con la explicación.
   */
  const leaveCourse = useCallback(
    (title: string, message: string) => {
      // La baja puede llegar a la vez por tiempo real y por varias peticiones rechazadas.
      if (leftRef.current) return;
      leftRef.current = true;

      for (const resource of (courseRef.current?.modules ?? []).flatMap((m) => m.resources ?? [])) {
        if (isQuiz(resource)) clearQuizDraft(resource.guid);
      }
      setLeaving(true);
      setCourse(null);
      setCurrentResource(null);
      setCompleted([]);
      setPendingAssignments([]);
      setQuizInProgress(false);

      notify.warning(title, message);
      router.replace(MY_COURSES);
    },
    [notify, router],
  );

  // El temario recuerda si se dejó abierto; en pantalla estrecha nace plegado.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = readLocal(SIDEBAR_KEY);
    if (stored !== null) return stored === 'true';
    return window.innerWidth >= 1024;
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const onResize = () => {
      const isNarrow = window.innerWidth < 1024;
      setIsMobile(isNarrow);
      // Al estrecharse se pliega el temario: si no, tapa el contenido.
      if (isNarrow) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // La preferencia sólo se recuerda en escritorio: en móvil siempre conviene plegado.
  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      const next = !open;
      if (!isMobile) writeLocal(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  const loadCourse = useCallback(async (): Promise<Course | null> => {
    try {
      const { data } = await api.get<Course>(`/courses/${courseId}`);
      setCourse(data);
      // Sin publicar, la API sólo manda la cabecera: se muestra el aviso de mantenimiento.
      if (data.status !== 'PUBLISHED') setUnderMaintenance(true);
      return data;
    } catch (error) {
      if (isAccessLost(error)) leaveCourse('No puedes abrir este curso', errorMessage(error));
      else notify.error('No se pudo cargar el curso', errorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId, notify, leaveCourse]);

  /**
   * ¿Terminó ya la vuelta actual? Lo dice su matrícula (`completedAt`): el certificado de una
   * vuelta anterior no da por terminado el curso que se está repitiendo. Devuelve el
   * certificado que la cerró, o `null` si sigue en curso.
   */
  const finishedRound = useCallback(async (): Promise<{ certificateGuid: string | null } | null> => {
    try {
      const { data: courses } = await api.get<Course[]>('/courses');
      const enrollment = Array.isArray(courses) ? courses.find((c) => c.guid === courseId) : undefined;
      if (!enrollment?.completedAt) return null;

      // Llegan del más reciente al más antiguo: el primero de este curso es el de esta vuelta.
      const { data: certificates } = await api.get<Certificate[]>('/certificates');
      const certificate = Array.isArray(certificates) ? certificates.find((c) => c.courseGuid === courseId) : undefined;
      return { certificateGuid: certificate?.guid ?? null };
    } catch {
      // Sin saberlo, el curso se abre con normalidad.
      return null;
    }
  }, [courseId]);

  /**
   * El curso está terminado. Si ya lo estaba al abrirlo, se ofrece repasarlo; si se termina
   * en esta visita, se celebra una sola vez y después queda en modo repaso.
   */
  const onRoundFinished = useCallback((certificateGuid: string | null) => {
    if (certificateGuid) setCertGuid(certificateGuid);
    if (celebrationShown.current) return;
    if (progressChecked.current) {
      setPendingCelebration(true);
    } else {
      celebrationShown.current = true;
      setShowCourseFinished(true);
    }
  }, []);

  /**
   * Avance del alumno en el curso.
   *
   * A los recursos completados se suman los que la API desbloquea por espera: si una tarea
   * lleva demasiado tiempo sin calificar, el alumno puede seguir en lugar de quedarse
   * parado esperando a su examinador.
   */
  const loadProgress = useCallback(async () => {
    try {
      const { data } = await api.get<CourseProgress>(`/students/progress/${courseId}`);

      setCompleted([...new Set([...(data.completed ?? []), ...(data.unlockedByWait ?? [])])]);
      setPendingAssignments(data.pendingAssignments ?? []);

      const round = await finishedRound();
      if (round) onRoundFinished(round.certificateGuid);
      progressChecked.current = true;
    } catch (error) {
      if (isAccessLost(error)) leaveCourse('No puedes abrir este curso', errorMessage(error));
      else showAlert.error('Error', errorMessage(error, 'No se pudo cargar tu avance en el curso.'));
    } finally {
      setProgressLoaded(true);
    }
  }, [courseId, finishedRound, onRoundFinished, showAlert, leaveCourse]);

  /**
   * Una acción rechazada por falta de acceso (403/404) puede deberse a una baja, a que el
   * curso pasó a mantenimiento o a que se retiró el recurso. La ficha del curso lo aclara:
   * saca al alumno, enseña el aviso de mantenimiento o, si el curso sigue abierto, explica
   * el error y pone al día el avance. Devuelve si se ha hecho cargo del error.
   */
  const handleAccessError = useCallback(
    (error: unknown, title: string): boolean => {
      if (!isAccessLost(error)) return false;
      void loadCourse().then((current) => {
        if (current?.status !== 'PUBLISHED') return;
        showAlert.error(title, errorMessage(error));
        void loadProgress();
      });
      return true;
    },
    [loadCourse, loadProgress, showAlert],
  );

  useEffect(() => {
    if (courseId) void loadCourse();
  }, [courseId, loadCourse]);

  useEffect(() => {
    if (courseId && studentGuid) void loadProgress();
  }, [courseId, studentGuid, loadProgress]);

  // El avance del alumno cambia desde fuera cuando el examinador califica una entrega.
  useRealtimeEvent('submission:graded', () => void loadProgress());
  useRealtimeEvent('enrollment:changed', (data) => {
    const event = data as { action?: string; courseGuid?: string };
    if (event?.action !== 'unenrolled' || event.courseGuid !== courseId) return;
    leaveCourse(
      'Ya no estás matriculado en este curso',
      'Tu matrícula fue dada de baja. Si crees que es un error, contacta con el administrador.',
    );
  });
  useRealtimeEvent('course:deleted', (data) => {
    if ((data as { guid?: string })?.guid !== courseId) return;
    leaveCourse('Este curso ya no está disponible', 'El curso fue eliminado de la plataforma.');
  });
  useRealtimeEvent('certificate:new', (data) => {
    const event = data as { guid?: string; courseGuid?: string };
    if (event?.courseGuid === courseId) onRoundFinished(event.guid ?? null);
  });
  // Lo que pasó mientras se cortó el tiempo real (una baja, una nota) no llegó como aviso.
  useRealtimeReconnect(() => {
    void loadCourse();
    void loadProgress();
  });

  useEffect(() => {
    import('@justinribeiro/lite-youtube').catch(console.error);
  }, []);

  // La felicitación espera a que se cierre el resultado del cuestionario que terminó el curso,
  // y sustituye al aviso de tareas por calificar si estaba abierto: sólo se ve una.
  useEffect(() => {
    if (!pendingCelebration || quizInProgress) return;
    const timer = setTimeout(() => {
      if (!celebrationShown.current) {
        celebrationShown.current = true;
        setShowPendingAlert(false);
        setShowCelebration(true);
      }
      setPendingCelebration(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingCelebration, quizInProgress]);

  /** Tras la felicitación el curso queda en modo repaso, como al abrir un curso ya terminado. */
  const closeCelebration = () => {
    setShowCelebration(false);
    setReadOnly(true);
  };

  // Los botones del certificado tardan 2 s en aparecer, para no cortar la felicitación.
  useEffect(() => {
    if (showCelebration) {
      const actionsTimer = setTimeout(() => setShowCelebrationActions(true), 2000);
      return () => clearTimeout(actionsTimer);
    } else {
      setShowCelebrationActions(false);
    }
  }, [showCelebration]);

  // Un administrador puede pasar el curso a mantenimiento con el alumno dentro.
  useRealtimeEvent('course:maintenance', (data) => {
    if ((data as { courseGuid?: string })?.courseGuid === courseId) setUnderMaintenance(true);
  });
  useRealtimeEvent('course:updated', (data) => {
    const event = data as { guid?: string; status?: string };
    if (event?.guid !== courseId) return;
    if (event.status === 'PUBLISHED') setUnderMaintenance(false);
    // Si cambió el contenido, cambia también lo que le queda por hacer.
    void loadCourse();
    void loadProgress();
  });

  // Tiempo dedicado al curso. Cuenta mientras la persona está trabajando, no mientras
  // tiene la pestaña abierta: la diferencia está explicada en el propio hook.
  useStudyTime(studentGuid && courseId && !leaving ? courseId : null, !readOnly);

  /** Recursos que se están marcando: cada botón espera para no enviar el aviso dos veces. */
  const marking = useInFlight<string>();
  const runMarking = marking.run;

  const markCompleted = useCallback(
    (resourceGuid: string) =>
      runMarking(resourceGuid, async () => {
        if (!studentGuid || completed.includes(resourceGuid)) return;
        try {
          await api.post('/students/complete-resource', { resourceGuid });
          setCompleted((prev) => [...prev, resourceGuid]);
        } catch (error) {
          const title = 'No se pudo marcar como completado';
          if (!handleAccessError(error, title)) showAlert.error(title, errorMessage(error));
        }
      }),
    [runMarking, studentGuid, completed, showAlert, handleAccessError],
  );

  const modules = course?.modules || [];

  // Las reglas de avance viven en `components/progression.ts`: son las que garantizan que
  // el certificado acredita haber pasado por todo el material.
  const isModuleUnlocked = (moduleIndex: number) => isModuleOpen(modules, moduleIndex, completed);
  const isResourceUnlocked = (moduleIndex: number, resourceIndex: number) =>
    isResourceOpen(modules, moduleIndex, resourceIndex, completed);

  const isResourceCompleted = (guid: string) => completed.includes(guid);
  const isResourceAwaitingGrade = (guid: string) => pendingAssignments.some((t) => t.resourceGuid === guid);

  const onResourceSelect = (resource: Resource, moduleIndex: number, resourceIndex: number) => {
    if (!isResourceUnlocked(moduleIndex, resourceIndex)) return;
    setCurrentResource(resource);
    // En móvil se pliega el temario al elegir: si no, tapa lo que se acaba de abrir.
    if (isMobile) setSidebarOpen(false);
  };

  // Se abre por donde se quedó; si ya terminó, por el último recurso, para que pueda
  // repasar en lugar de encontrarse la pantalla vacía.
  useEffect(() => {
    if (!course || !progressLoaded || currentResource) return;

    const moduleList = course.modules || [];
    const target = whereToResume(moduleList, completed) ?? lastResource(moduleList);
    if (!target || !isResourceOpen(moduleList, target.moduleIndex, target.resourceIndex, completed)) return;

    const resource = moduleList[target.moduleIndex]?.resources?.[target.resourceIndex];
    if (!resource) return;

    setCurrentResource(resource);
    if (isMobile) setSidebarOpen(false);
  }, [course, progressLoaded, currentResource, completed, isMobile]);

  // Todo hecho o entregado, pero con tareas esperando nota: se explica por qué aún no hay certificado.
  const pendingAlertShown = useRef(false);
  useEffect(() => {
    if (!course || !progressLoaded || pendingAlertShown.current || celebrationShown.current) return;
    const allResources = (course.modules || []).flatMap((m) => m.resources || []);
    if (allResources.length === 0) return;

    // Un recurso está «hecho por parte del alumno» si ya consta completado o si tiene una
    // entrega esperando nota: en ese caso él hizo lo suyo y espera al examinador.
    const pendingGuids = new Set(pendingAssignments.map((t) => t.resourceGuid));
    const allDoneOrSubmitted = allResources.every(
      (r: Resource) => completed.includes(r.guid) || pendingGuids.has(r.guid),
    );

    if (allDoneOrSubmitted && pendingAssignments.length > 0) {
      pendingAlertShown.current = true;
      setShowPendingAlert(true);
    }
  }, [course, progressLoaded, completed, pendingAssignments]);

  const resourceIcon = (resource: Resource, isCompleted: boolean, locked: boolean) => {
    if (locked) return <Lock className="h-4 w-4 text-muted-foreground/50" />;
    if (resource.type === 'TEXT') return <Type className={`h-4 w-4 ${isCompleted ? 'text-emerald-500' : ''}`} />;
    if (resource.type === 'LINK') {
      const className = `h-4 w-4 ${isCompleted ? 'text-emerald-500' : 'text-pink-500'}`;
      const target = linkTarget(resource);
      if (target.kind === 'image') return <ImageIcon className={className} />;
      if (target.kind === 'link') return <ExternalLink className={className} />;
      return <PlayCircle className={className} />;
    }
    if (isQuiz(resource))
      return <CheckCircle className={`h-4 w-4 ${isCompleted ? 'text-emerald-500' : 'text-amber-500'}`} />;
    if (resource.type === 'ASSIGNMENT')
      return <FileText className={`h-4 w-4 ${isCompleted ? 'text-emerald-500' : 'text-blue-500'}`} />;
    return <BookOpen className="h-4 w-4" />;
  };

  useEffect(() => {
    const onPageLeave = (e: BeforeUnloadEvent) => {
      if (quizInProgress) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onPageLeave);
    return () => window.removeEventListener('beforeunload', onPageLeave);
  }, [quizInProgress]);

  if (leaving) {
    return <PageLoader message="Volviendo a tus cursos..." />;
  }

  if (loading) {
    return <PageLoader message="Cargando contenido del curso..." />;
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Curso no encontrado</h1>
        <Link href="/dashboard" className="mt-4 text-primary font-bold">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (underMaintenance) {
    return <CourseUnderMaintenance title={course.title} />;
  }

  // Lleva directamente a la ficha del certificado de este curso cuando ya se conoce.
  const certificatesUrl = `/dashboard/student/certificates${certGuid ? `?open=${certGuid}` : ''}`;

  if (showCourseFinished) {
    const viewOnly = () => {
      setShowCourseFinished(false);
      setReadOnly(true);
    };

    return (
      <CourseAlreadyEnded
        title={course.title}
        onViewOnly={viewOnly}
        onViewCertificate={() => router.push(certificatesUrl)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Aviso de solo lectura */}
      {readOnly && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-center gap-3 text-sm shrink-0 z-50">
          <div className="flex items-center gap-2 text-primary font-medium">
            <Eye className="h-4 w-4" />
            <span>Modo de solo lectura — Este curso ya fue completado</span>
          </div>
          <button
            onClick={() => router.push(certificatesUrl)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-3 py-1 rounded-lg transition-colors"
          >
            Ver certificado
          </button>
        </div>
      )}
      {/* Barra superior */}
      {!quizInProgress && (
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 h-14 flex items-center px-4 gap-3 shrink-0">
          <Link
            href={MY_COURSES}
            className="p-2 hover:bg-muted rounded-xl transition-colors"
            aria-label="Volver a mis cursos"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Botón para plegar el temario */}
          <button
            onClick={toggleSidebar}
            className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all duration-200 border shadow-sm
              ${
                sidebarOpen
                  ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                  : 'bg-muted/50 border-border hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-primary'
              }
            `}
            title={sidebarOpen ? 'Ocultar temario' : 'Mostrar temario'}
          >
            <div className="relative h-5 w-5 flex items-center justify-center overflow-hidden">
              <PanelLeft
                className={`h-5 w-5 absolute transition-all duration-300 ${
                  sidebarOpen ? 'opacity-0 rotate-180 scale-50' : 'opacity-100 rotate-0 scale-100'
                }`}
              />
              <PanelLeftClose
                className={`h-5 w-5 absolute transition-all duration-300 ${
                  sidebarOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-180 scale-50'
                }`}
              />
            </div>
            <span className="hidden sm:inline">{sidebarOpen ? 'Ocultar' : 'Temario'}</span>
          </button>

          <div className="flex-1 truncate font-bold text-base">{course.title}</div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Fondo del temario desplegado en móvil */}
        {isMobile && sidebarOpen && !quizInProgress && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Temario: módulos y recursos */}
        {!quizInProgress && (
          <div
            className={`bg-card border-r border-border overflow-y-auto flex flex-col shrink-0 transition-all duration-300 ease-in-out z-50
              ${
                isMobile
                  ? `fixed inset-y-0 left-0 w-[300px] shadow-2xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
                  : `${sidebarOpen ? 'w-[320px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-r-0'}`
              }
            `}
          >
            {/* Cabecera del temario */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Temario del curso</h2>
              </div>
              {/* Botón de cerrar dentro del temario, en móvil */}
              {isMobile && (
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Cerrar temario"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="p-3 space-y-2 flex-1">
              {modules.map((mod: CourseModule, mi: number) => {
                const unlocked = isModuleUnlocked(mi);
                const resources = mod.resources || [];
                const allCompleted =
                  resources.length > 0 && resources.every((r: Resource) => completed.includes(r.guid));

                return (
                  <div key={mod.guid} className="rounded-xl border border-border/50 overflow-hidden">
                    {/* Cabecera del módulo */}
                    <div
                      className={`flex items-center gap-2 p-3 text-sm font-bold ${!unlocked ? 'opacity-50' : allCompleted ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
                    >
                      {!unlocked ? (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : allCompleted ? (
                        <Trophy className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <span className="truncate flex-1">{mod.title}</span>
                    </div>

                    {/* Recursos */}
                    {unlocked && (
                      <div className="border-t border-border/30 bg-background px-2 py-1 space-y-0.5">
                        {resources.map((r: Resource, ri: number) => {
                          const rUnlocked = isResourceUnlocked(mi, ri);
                          const rCompleted = isResourceCompleted(r.guid);
                          const awaitingGrade = isResourceAwaitingGrade(r.guid);
                          const isSelected = currentResource?.guid === r.guid;
                          const title = displayTitle(r);

                          return (
                            <div
                              key={r.guid}
                              onClick={() => onResourceSelect(r, mi, ri)}
                              className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                                !rUnlocked
                                  ? 'opacity-40 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-primary/10 text-primary font-bold cursor-pointer'
                                    : 'hover:bg-muted cursor-pointer text-foreground'
                              }`}
                            >
                              {resourceIcon(r, rCompleted, !rUnlocked)}
                              <span
                                className={`truncate flex-1 ${rCompleted && !awaitingGrade ? 'italic line-through text-muted-foreground' : ''}`}
                              >
                                {title}
                              </span>
                              {awaitingGrade ? (
                                <span title="Entregada, pendiente de calificación">
                                  <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                                </span>
                              ) : rCompleted ? (
                                <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel de contenido */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {!currentResource ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
              <BookOpen className="h-24 w-24 mb-6" />
              <h2 className="text-xl font-bold mb-2">Selecciona un recurso</h2>
              <p className="text-center max-w-sm">Haz clic en un recurso del temario para ver su contenido aquí.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
              {/* Título del recurso */}
              <div className="mb-8 pb-6 border-b border-border">
                <span className="text-primary font-bold tracking-widest uppercase text-xs mb-2 block">
                  {resourceLabel(currentResource)}
                </span>
                <h2 className="text-2xl lg:text-3xl font-bold">{displayTitle(currentResource)}</h2>
              </div>

              {/* TEXTO */}
              {currentResource.type === 'TEXT' && (
                <div className="space-y-6">
                  <div
                    className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-8 border border-border/50 shadow-sm"
                    dangerouslySetInnerHTML={sanitizeHTML(
                      currentResource.contentHtml || '<p class="text-muted-foreground italic">Sin contenido.</p>',
                    )}
                  />
                  {currentResource.referenceUrl && (
                    <a
                      href={externalUrl(currentResource.referenceUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl text-sm text-primary font-medium hover:bg-primary/10 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" /> {currentResource.referenceUrl}
                    </a>
                  )}
                  {currentResource.attachmentKey && (
                    <a
                      href={fileUrlFor(currentResource.attachmentUrl) ?? ''}
                      className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl hover:bg-primary/10 transition-colors"
                    >
                      <Paperclip className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold">{currentResource.attachmentName || 'Archivo adjunto'}</span>
                    </a>
                  )}

                  {!readOnly && !isResourceCompleted(currentResource.guid) && (
                    <MarkCompletedButton
                      onClick={() => markCompleted(currentResource.guid)}
                      busy={marking.has(currentResource.guid)}
                    />
                  )}
                </div>
              )}

              {/* Enlace: una imagen, un vídeo de YouTube o una página externa. */}
              {currentResource.type === 'LINK' && (
                <div className="space-y-6">
                  <ResourceTarget resource={currentResource} />

                  {!readOnly && !isResourceCompleted(currentResource.guid) && (
                    <MarkCompletedButton
                      onClick={() => markCompleted(currentResource.guid)}
                      busy={marking.has(currentResource.guid)}
                    />
                  )}
                </div>
              )}

              {/* Cada recurso monta su propio visor: el estado de una entrega o de un
                  intento no debe arrastrarse al abrir la siguiente actividad. */}
              {currentResource.type === 'ASSIGNMENT' && !isQuiz(currentResource) && (
                <AssignmentViewer
                  key={currentResource.guid}
                  resourceGuid={currentResource.guid}
                  instructionsHtml={currentResource.contentHtml || ''}
                  attachmentUrl={currentResource.attachmentUrl}
                  attachmentName={currentResource.attachmentName}
                  referenceUrl={currentResource.referenceUrl}
                  maxUploadMb={currentResource.maxUploadMb}
                  passingScore={course.passingScore}
                  readOnly={readOnly}
                  onFinish={() => {
                    if (!readOnly) void loadProgress();
                  }}
                  onAccessError={handleAccessError}
                />
              )}

              {isQuiz(currentResource) &&
                (readOnly ? (
                  <div className="space-y-4">
                    {currentResource.contentHtml && (
                      <div
                        className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-6 border border-border/50 shadow-sm"
                        dangerouslySetInnerHTML={sanitizeHTML(currentResource.contentHtml)}
                      />
                    )}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                        Este cuestionario ya fue completado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <QuizViewer
                    key={currentResource.guid}
                    resourceGuid={currentResource.guid}
                    resourceTitle={displayTitle(currentResource)}
                    instructionsHtml={currentResource.contentHtml || ''}
                    referenceUrl={currentResource.referenceUrl}
                    attachmentUrl={currentResource.attachmentUrl}
                    attachmentName={currentResource.attachmentName}
                    onFinish={async (passed) => {
                      await loadProgress();
                      if (passed) return;
                      // Suspender devuelve al principio del módulo, para repasarlo antes de repetir.
                      const quizModule = modules.find((m) => m.resources?.some((r) => r.guid === currentResource.guid));
                      const firstResource = quizModule?.resources?.[0];
                      if (firstResource) setCurrentResource(firstResource);
                    }}
                    onQuizStateChange={setQuizInProgress}
                    onAccessError={handleAccessError}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ventana de felicitación al terminar el curso ── */}
      {showCelebration && (
        <Celebration
          title={course.title}
          actionsVisible={showCelebrationActions}
          onKeepGoing={closeCelebration}
          onViewCertificate={() => {
            closeCelebration();
            router.push(certificatesUrl);
          }}
        />
      )}

      {showPendingAlert && (
        <UngradedAssignments
          assignments={pendingAssignments}
          onAcknowledge={() => setShowPendingAlert(false)}
          onGoToMessages={() => {
            setShowPendingAlert(false);
            router.push('/dashboard/messages');
          }}
        />
      )}
    </div>
  );
}

function MarkCompletedButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="mt-8 pt-6 border-t border-border flex justify-center animate-in fade-in duration-500">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 text-lg disabled:opacity-60 disabled:hover:scale-100"
      >
        <CheckCircle className="h-6 w-6" /> Marcar como Completado
      </button>
    </div>
  );
}
