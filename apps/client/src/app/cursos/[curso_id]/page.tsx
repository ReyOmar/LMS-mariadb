'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Type,
  CheckCircle,
  Trophy,
  Lock,
  PlayCircle,
  Paperclip,
  UploadCloud,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Award,
  Sparkles,
  Download,
  Clock,
  Eye,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  ChevronRight,
  Layers,
  X,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import Link from 'next/link';
import api, { urlDeArchivo } from '@/lib/api';
import { useEventoRealtime, useRealtime } from '@/contexts/RealtimeContext';
import { sanitizeHTML } from '@/lib/sanitize';
import QuizPlayer from '@/components/quiz/QuizPlayer';
import AssignmentPlayer from '@/components/tareas/AssignmentPlayer';

export default function CursoVisorPage() {
  const { curso_id } = useParams();
  const router = useRouter();
  const [curso, setCurso] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completados, setCompletados] = useState<string[]>([]);
  const [selectedRecurso, setSelectedRecurso] = useState<any>(null);
  const [selectedModuloGuid, setSelectedModuloGuid] = useState<string>('');
  const [userGuid, setUserGuid] = useState<string>('');
  const [progresoLoaded, setProgresoLoaded] = useState(false);
  const [inMaintenance, setInMaintenance] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCelebrationActions, setShowCelebrationActions] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{ curso_titulo: string } | null>(null);
  const [tareasPendientes, setTareasPendientes] = useState<
    { recurso_guid: string; tarea_titulo: string; fecha_entrega: string }[]
  >([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [courseCompleted, setCourseCompleted] = useState(false);
  const [viewOnlyMode, setViewOnlyMode] = useState(false);
  const [showCompletedOverlay, setShowCompletedOverlay] = useState(false);
  const [certGuid, setCertGuid] = useState<string | null>(null);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [pendingCelebration, setPendingCelebration] = useState<any>(null);
  const celebrationShownRef = useRef(false);
  const { cursosEnMantenimiento } = useRealtime();

  // Sidebar toggle state — remembers preference, defaults closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('lms_sidebar_open');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 1024; // default open on desktop, closed on mobile
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  // Track viewport changes for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // Auto-close sidebar when switching TO mobile if it was open
      if (mobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  // Persist sidebar preference (only for desktop)
  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (!isMobile) localStorage.setItem('lms_sidebar_open', String(next));
      return next;
    });
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('lms_user');
    if (savedUser) {
      try {
        setUserGuid(JSON.parse(savedUser).guid);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!curso_id) return;

    fetchCurso();
  }, [curso_id]);

  useEffect(() => {
    if (!curso_id || !userGuid) return;

    fetchProgreso();
  }, [curso_id, userGuid, curso]);

  // El avance del alumno cambia desde fuera cuando el examinador califica una entrega.
  useEventoRealtime('submission:graded', () => fetchProgreso());
  useEventoRealtime('certificate:new', (datos) => {
    const evento = datos as { curso_guid?: string };
    if (evento?.curso_guid === curso_id && !celebrationShownRef.current) setPendingCelebration(evento);
  });

  useEffect(() => {
    import('@justinribeiro/lite-youtube').catch(console.error);
  }, []);

  useEffect(() => {
    if (pendingCelebration && !isQuizActive) {
      const timer = setTimeout(() => {
        if (!celebrationShownRef.current) {
          celebrationShownRef.current = true;
          setCelebrationData({ curso_titulo: pendingCelebration.curso_titulo || curso?.titulo || 'el curso' });
          setShowCelebration(true);
          setShowCelebrationActions(false);
        }
        setPendingCelebration(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [pendingCelebration, isQuizActive, curso]);

  // Delay the certificate action buttons for 2s after the celebration appears
  useEffect(() => {
    if (showCelebration) {
      const actionsTimer = setTimeout(() => setShowCelebrationActions(true), 2000);
      return () => clearTimeout(actionsTimer);
    } else {
      setShowCelebrationActions(false);
    }
  }, [showCelebration]);

  // Listen for maintenance events on this specific course (students only)
  useEffect(() => {
    if (cursosEnMantenimiento[curso_id as string]) {
      setInMaintenance(true);
    }
  }, [cursosEnMantenimiento, curso_id]);

  // Un administrador puede pasar el curso a mantenimiento con el alumno dentro.
  useEventoRealtime('course:maintenance', (datos) => {
    if ((datos as { curso_guid?: string })?.curso_guid === curso_id) setInMaintenance(true);
  });
  useEventoRealtime('course:updated', (datos) => {
    const evento = datos as { guid?: string; estado?: string };
    if (evento?.guid !== curso_id) return;
    if (evento.estado === 'PUBLICADO') setInMaintenance(false);
    fetchCurso();
  });

  // Heartbeat for active time tracking
  useEffect(() => {
    if (!userGuid || !curso_id || viewOnlyMode) return;
    const sendHeartbeat = () => {
      if (!document.hidden) {
        api.post('/estudiantes/latido', { curso_guid: curso_id }).catch(() => {});
      }
    };
    sendHeartbeat(); // Send immediately
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [userGuid, curso_id, viewOnlyMode]);

  const fetchCurso = async () => {
    try {
      const res = await api.get(`/cursos/${curso_id}`);
      const data = res.data;
      setCurso(data);
      // If the course is in BORRADOR when loaded, show maintenance immediately (students only)
      if (data.estado === 'BORRADOR') {
        setInMaintenance(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgreso = async () => {
    try {
      const res = await api.get(`/estudiantes/progreso/${curso_id}`);
      const data = res.data;
      // Merge completados + desbloqueados_por_tiempo for navigation purposes
      const realCompleted = data.completados || [];
      const autoUnlocked = data.desbloqueados_por_tiempo || [];
      const allEffective = [...new Set([...realCompleted, ...autoUnlocked])];
      setCompletados(allEffective);
      setTareasPendientes(data.tareas_pendientes_calificacion || []);

      // Check if course has a certificate (already completed)
      try {
        const verifRes = await api.get(`/certificados/finalizacion/${curso_id}`);
        const verifData = verifRes.data;
        if (verifData.completo && verifData.puede_generar_certificado) {
          // Check if certificate actually exists
          const certsRes = await api.get('/certificados');
          const certs = Array.isArray(certsRes.data) ? certsRes.data : [];
          const matchCert = certs.find((c: any) => c.curso_guid === curso_id);
          if (matchCert) {
            setCourseCompleted(true);
            setCertGuid(matchCert.guid);
            setShowCompletedOverlay(true);
          }
        }
      } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setProgresoLoaded(true);
    }
  };

  const marcarCompletado = useCallback(
    async (recurso_guid: string) => {
      if (!userGuid || completados.includes(recurso_guid)) return;
      try {
        await api.post('/estudiantes/completar-recurso', { recurso_guid });
        setCompletados((prev) => [...prev, recurso_guid]);
      } catch (err) {
        console.error(err);
      }
    },
    [userGuid, completados],
  );

  // Helper to ensure URLs are absolute
  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url;
    return `https://${url}`;
  };

  const modulos = curso?.modulos || [];

  // --- UNLOCK LOGIC ---
  // For each module, check if ALL resources in the PREVIOUS module are completed
  const isModuloUnlocked = (moduleIndex: number): boolean => {
    if (moduleIndex === 0) return true; // First module always unlocked
    const prevModulo = modulos[moduleIndex - 1];
    const prevRecursos = prevModulo?.recursos || [];
    if (prevRecursos.length === 0) return true; // Empty module = unlocked
    return prevRecursos.every((r: any) => completados.includes(r.guid));
  };

  // For each resource inside a module, check if ALL previous resources in same module are completed
  const isRecursoUnlocked = (moduleIndex: number, resourceIndex: number): boolean => {
    if (!isModuloUnlocked(moduleIndex)) return false;
    if (resourceIndex === 0) return true; // First resource in module always unlocked (if module is unlocked)
    const recursos = modulos[moduleIndex]?.recursos || [];
    for (let i = 0; i < resourceIndex; i++) {
      if (!completados.includes(recursos[i].guid)) return false;
    }
    return true;
  };

  const isRecursoCompleted = (guid: string) => completados.includes(guid);
  const isRecursoPendingGrading = (guid: string) => tareasPendientes.some((t) => t.recurso_guid === guid);

  const handleSelectRecurso = (recurso: any, moduloGuid: string, moduleIndex: number, resourceIndex: number) => {
    if (!isRecursoUnlocked(moduleIndex, resourceIndex)) return;
    setSelectedRecurso(recurso);
    setSelectedModuloGuid(moduloGuid);
    // Auto-close sidebar on mobile for better content visibility
    if (isMobile) setSidebarOpen(false);
  };

  // Auto-select first uncompleted resource (Retomar Curso)
  useEffect(() => {
    if (curso && progresoLoaded && !selectedRecurso) {
      const modulosList = curso.modulos || [];
      let targetRecurso = null;
      let targetModuloGuid = '';
      let targetModIdx = -1;
      let targetRecIdx = -1;

      for (let m = 0; m < modulosList.length; m++) {
        if (!isModuloUnlocked(m)) break;
        const recursos = modulosList[m]?.recursos || [];
        for (let r = 0; r < recursos.length; r++) {
          if (!completados.includes(recursos[r].guid)) {
            // Found first uncompleted resource
            targetRecurso = recursos[r];
            targetModuloGuid = modulosList[m].guid;
            targetModIdx = m;
            targetRecIdx = r;
            break;
          }
        }
        if (targetRecurso) break;
      }

      // If all are completed, select the very last resource
      if (!targetRecurso && modulosList.length > 0) {
        const lastMod = modulosList[modulosList.length - 1];
        const lastRecursos = lastMod?.recursos || [];
        if (lastRecursos.length > 0) {
          targetRecurso = lastRecursos[lastRecursos.length - 1];
          targetModuloGuid = lastMod.guid;
          targetModIdx = modulosList.length - 1;
          targetRecIdx = lastRecursos.length - 1;
        }
      }

      if (targetRecurso) {
        // Bypass the wrapper to avoid triggering complete immediately if not wanted,
        // but handleSelectRecurso handles the marking anyway, which is fine.
        handleSelectRecurso(targetRecurso, targetModuloGuid, targetModIdx, targetRecIdx);
      }
    }
  }, [curso, progresoLoaded, selectedRecurso, completados]);

  // Auto-detect: all resources done/submitted but tasks pending grading → show pending modal
  const pendingModalShownRef = useRef(false);
  useEffect(() => {
    if (!curso || !progresoLoaded || pendingModalShownRef.current || celebrationShownRef.current) return;
    const allRecursos = (curso.modulos || []).flatMap((m: any) =>
      m.recursos || [],
    );
    if (allRecursos.length === 0) return;

    // A resource is "done from the student's side" if:
    // - It's in completados (graded/completed), OR
    // - It has a pending submission (student uploaded their work)
    const pendingGuids = new Set(tareasPendientes.map((t) => t.recurso_guid));
    const allDoneOrSubmitted = allRecursos.every((r: any) => completados.includes(r.guid) || pendingGuids.has(r.guid));

    if (allDoneOrSubmitted && tareasPendientes.length > 0) {
      pendingModalShownRef.current = true;
      setShowPendingModal(true);
    }
  }, [curso, progresoLoaded, completados, tareasPendientes]);

  const getRecursoIcon = (recurso: any, completed: boolean, locked: boolean) => {
    if (locked) return <Lock className="h-4 w-4 text-muted-foreground/50" />;
    if (recurso.tipo === 'TEXTO') return <Type className={`h-4 w-4 ${completed ? 'text-emerald-500' : ''}`} />;
    if (recurso.tipo === 'ENLACE')
      return <PlayCircle className={`h-4 w-4 ${completed ? 'text-emerald-500' : 'text-pink-500'}`} />;
    if (recurso.tipo === 'TAREA' && recurso.titulo?.startsWith('[QUIZ]'))
      return <CheckCircle className={`h-4 w-4 ${completed ? 'text-emerald-500' : 'text-amber-500'}`} />;
    if (recurso.tipo === 'TAREA')
      return <FileText className={`h-4 w-4 ${completed ? 'text-emerald-500' : 'text-blue-500'}`} />;
    return <BookOpen className="h-4 w-4" />;
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isQuizActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isQuizActive]);

  if (loading) {
    return <PageLoader message="Cargando contenido del curso..." />;
  }

  if (!curso) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Curso no encontrado</h1>
        <Link href="/dashboard" className="mt-4 text-primary font-bold">
          Volver al inicio
        </Link>
      </div>
    );
  }

  // MAINTENANCE OVERLAY
  if (inMaintenance) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <div className="max-w-md w-full bg-card border border-amber-500/30 rounded-3xl p-12 text-center shadow-xl">
          <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
          </div>
          <h1 className="text-3xl font-black mb-4 text-foreground tracking-tight">Curso en Mantenimiento</h1>
          <p className="text-muted-foreground mb-2 text-lg leading-relaxed">
            El administrador o examinador ha iniciado un período de mantenimiento para el curso{' '}
            <strong className="text-foreground">{curso.titulo}</strong>.
          </p>
          <p className="text-muted-foreground mb-10 text-sm">
            Todos los contenidos se conservan intactos. Vuelve más tarde cuando el curso sea publicado de nuevo.
          </p>
          <Link
            href="/dashboard/student/cursos"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver a Mis Cursos
          </Link>
        </div>
      </div>
    );
  }

  // COURSE COMPLETED OVERLAY — shown when course has a certificate
  if (showCompletedOverlay && courseCompleted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <div className="max-w-lg w-full bg-card border border-emerald-500/30 rounded-3xl overflow-hidden shadow-xl relative">
          {/* Close button */}
          <button
            onClick={() => {
              setShowCompletedOverlay(false);
              setViewOnlyMode(true);
            }}
            className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-background/80 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Gradient header */}
          <div className="relative bg-gradient-to-br from-emerald-500/15 via-primary/10 to-emerald-500/5 p-10 text-center overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 via-primary to-emerald-500" />
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/5 rounded-full" />
            <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-primary/5 rounded-full" />

            <div className="relative z-10">
              <div
                className="w-24 h-24 bg-gradient-to-br from-emerald-500/20 to-primary/20 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-background shadow-xl"
                style={{ animation: 'bounce 2s infinite' }}
              >
                <Trophy className="h-12 w-12 text-emerald-500" />
              </div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h1 className="text-2xl font-black text-foreground">¡Curso Finalizado!</h1>
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">Ya completaste exitosamente el curso</p>
              <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg mt-1">{curso.titulo}</p>
            </div>
          </div>

          <div className="p-8 text-center">
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Tu certificado de finalización ya fue generado. Puedes descargarlo o revisitar el contenido del curso en
              modo de solo lectura.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => router.push(`/dashboard/student/certificados${certGuid ? `?open=${certGuid}` : ''}`)}
                className="w-full sm:flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                <Award className="h-5 w-5" /> Ver Mi Certificado
              </button>
              <button
                onClick={() => {
                  setShowCompletedOverlay(false);
                  setViewOnlyMode(true);
                }}
                className="w-full sm:flex-1 bg-muted hover:bg-border text-foreground font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Eye className="h-5 w-5" /> Solo Visualizar
              </button>
            </div>

            <Link
              href="/dashboard/student/cursos"
              className="inline-flex items-center gap-2 mt-5 text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Volver a Mis Cursos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* View-Only Banner */}
      {viewOnlyMode && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center justify-center gap-3 text-sm shrink-0 z-50">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
            <Eye className="h-4 w-4" />
            <span>Modo de solo lectura — Este curso ya fue completado</span>
          </div>
          <button
            onClick={() => router.push('/dashboard/student/certificados')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-lg transition-colors"
          >
            Ver Certificado
          </button>
        </div>
      )}
      {/* Top Navbar */}
      {!isQuizActive && (
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 h-14 flex items-center px-4 gap-3 shrink-0">
          <Link href="/dashboard/student/cursos" className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Sidebar Toggle Button */}
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
            {/* Pulsing dot indicator when sidebar is closed (hint there's content) */}
            {!sidebarOpen && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary/60"></span>
              </span>
            )}
          </button>

          <div className="flex-1 truncate font-bold text-base">{curso.titulo}</div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Overlay Backdrop */}
        {isMobile && sidebarOpen && !isQuizActive && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar — Module & Resource List */}
        {!isQuizActive && (
          <div
            className={`bg-card border-r border-border overflow-y-auto flex flex-col shrink-0 transition-all duration-300 ease-in-out z-50
              ${
                isMobile
                  ? `fixed inset-y-0 left-0 w-[300px] shadow-2xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
                  : `${sidebarOpen ? 'w-[320px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-r-0'}`
              }
            `}
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Temario del Curso</h2>
              </div>
              {/* Close button inside sidebar (mobile) */}
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
              {modulos.map((mod: any, mi: number) => {
                const unlocked = isModuloUnlocked(mi);
                const recursos = mod.recursos || [];
                const allCompleted = recursos.length > 0 && recursos.every((r: any) => completados.includes(r.guid));

                return (
                  <div key={mod.guid} className="rounded-xl border border-border/50 overflow-hidden">
                    {/* Module header */}
                    <div
                      className={`flex items-center gap-2 p-3 text-sm font-bold ${!unlocked ? 'opacity-50' : allCompleted ? 'text-emerald-600' : ''}`}
                    >
                      {!unlocked ? (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : allCompleted ? (
                        <Trophy className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <span className="truncate flex-1">{mod.titulo}</span>
                    </div>

                    {/* Resources */}
                    {unlocked && (
                      <div className="border-t border-border/30 bg-background px-2 py-1 space-y-0.5">
                        {recursos.map((r: any, ri: number) => {
                          const rUnlocked = isRecursoUnlocked(mi, ri);
                          const rCompleted = isRecursoCompleted(r.guid);
                          const isSelected = selectedRecurso?.guid === r.guid;
                          const displayTitle = r.titulo?.startsWith('[QUIZ]')
                            ? r.titulo.replace('[QUIZ] ', '')
                            : r.titulo;

                          return (
                            <div
                              key={r.guid}
                              onClick={() => handleSelectRecurso(r, mod.guid, mi, ri)}
                              className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                                !rUnlocked
                                  ? 'opacity-40 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-primary/10 text-primary font-bold cursor-pointer'
                                    : 'hover:bg-muted cursor-pointer text-foreground'
                              }`}
                            >
                              {getRecursoIcon(r, rCompleted, !rUnlocked)}
                              <span
                                className={`truncate flex-1 ${rCompleted && !isRecursoPendingGrading(r.guid) ? 'italic line-through text-muted-foreground' : ''}`}
                              >
                                {displayTitle}
                              </span>
                              {rCompleted && isRecursoPendingGrading(r.guid) ? (
                                <span title="Pendiente de calificación">
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

        {/* Main Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {!selectedRecurso ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
              <BookOpen className="h-24 w-24 mb-6" />
              <h2 className="text-xl font-bold mb-2">Selecciona un recurso</h2>
              <p className="text-center max-w-sm">Haz clic en un recurso del temario para ver su contenido aquí.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
              {/* Resource Title */}
              <div className="mb-8 pb-6 border-b border-border">
                <span className="text-primary font-bold tracking-widest uppercase text-xs mb-2 block">
                  {selectedRecurso.tipo === 'TEXTO'
                    ? 'LECTURA'
                    : selectedRecurso.tipo === 'ENLACE'
                      ? 'VIDEO'
                      : selectedRecurso.tipo === 'TAREA' && selectedRecurso.titulo?.startsWith('[QUIZ]')
                        ? 'CUESTIONARIO'
                        : 'TAREA'}
                </span>
                <h2 className="text-2xl lg:text-3xl font-bold">
                  {selectedRecurso.titulo?.startsWith('[QUIZ]')
                    ? selectedRecurso.titulo.replace('[QUIZ] ', '')
                    : selectedRecurso.titulo}
                </h2>
              </div>

              {/* TEXTO */}
              {selectedRecurso.tipo === 'TEXTO' && (
                <div className="space-y-6">
                  <div
                    className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-8 border border-border/50 shadow-sm"
                    dangerouslySetInnerHTML={sanitizeHTML(
                      selectedRecurso.contenido_html || '<p class="text-muted-foreground italic">Sin contenido.</p>',
                    )}
                  />
                  {selectedRecurso.url_referencia && (
                    <a
                      href={ensureAbsoluteUrl(selectedRecurso.url_referencia)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl text-sm text-primary font-medium hover:bg-primary/10 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" /> {selectedRecurso.url_referencia}
                    </a>
                  )}
                  {selectedRecurso.archivo_adjunto && (
                    <a
                      href={urlDeArchivo(selectedRecurso.archivo_adjunto_url) ?? ''}
                      className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl hover:bg-primary/10 transition-colors"
                    >
                      <Paperclip className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold">
                        {selectedRecurso.archivo_adjunto_nombre || 'Archivo adjunto'}
                      </span>
                    </a>
                  )}

                  {!viewOnlyMode && !isRecursoCompleted(selectedRecurso.guid) && (
                    <div className="mt-8 pt-6 border-t border-border flex justify-center animate-in fade-in duration-500">
                      <button
                        onClick={() => marcarCompletado(selectedRecurso.guid)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 text-lg"
                      >
                        <CheckCircle className="h-6 w-6" /> Marcar como Completado
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ENLACE (Video) */}
              {selectedRecurso.tipo === 'ENLACE' && (
                <div className="space-y-6">
                  {selectedRecurso.contenido_html?.includes('youtube.com/watch?v=') && (
                    <div
                      className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
                      dangerouslySetInnerHTML={{
                        __html: `<lite-youtube videoid="${new URL(selectedRecurso.contenido_html).searchParams.get('v')}"></lite-youtube>`,
                      }}
                    />
                  )}
                  {selectedRecurso.contenido_html?.includes('youtu.be/') && (
                    <div
                      className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
                      dangerouslySetInnerHTML={{
                        __html: `<lite-youtube videoid="${selectedRecurso.contenido_html.split('youtu.be/')[1].split('?')[0]}"></lite-youtube>`,
                      }}
                    />
                  )}
                  {!selectedRecurso.contenido_html && (
                    <div className="w-full h-64 bg-muted/20 border border-dashed border-border rounded-2xl flex items-center justify-center text-muted-foreground">
                      <PlayCircle className="h-12 w-12 opacity-30" />
                    </div>
                  )}

                  {!viewOnlyMode && !isRecursoCompleted(selectedRecurso.guid) && (
                    <div className="mt-8 pt-6 border-t border-border flex justify-center animate-in fade-in duration-500">
                      <button
                        onClick={() => marcarCompletado(selectedRecurso.guid)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 text-lg"
                      >
                        <CheckCircle className="h-6 w-6" /> Marcar como Completado
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAREA */}
              {selectedRecurso.tipo === 'TAREA' &&
                !selectedRecurso.titulo?.startsWith('[QUIZ]') &&
                (viewOnlyMode ? (
                  <AssignmentPlayer
                    curso_id={curso_id as string}
                    recurso_guid={selectedRecurso.guid}
                    bloque_titulo={selectedRecurso.titulo}
                    instrucciones_html={selectedRecurso.contenido_html || ''}
                    archivo_adjunto_url={selectedRecurso.archivo_adjunto_url}
                    archivo_adjunto_nombre={selectedRecurso.archivo_adjunto_nombre}
                    url_referencia={selectedRecurso.url_referencia}
                    archivo_max_size_mb={selectedRecurso.archivo_max_size_mb ?? 5}
                    readOnly={true}
                    onFinish={() => {}}
                  />
                ) : (
                  <AssignmentPlayer
                    curso_id={curso_id as string}
                    recurso_guid={selectedRecurso.guid}
                    bloque_titulo={selectedRecurso.titulo}
                    instrucciones_html={selectedRecurso.contenido_html || ''}
                    archivo_adjunto_url={selectedRecurso.archivo_adjunto_url}
                    archivo_adjunto_nombre={selectedRecurso.archivo_adjunto_nombre}
                    url_referencia={selectedRecurso.url_referencia}
                    archivo_max_size_mb={selectedRecurso.archivo_max_size_mb ?? 5}
                    onFinish={() => fetchProgreso()}
                  />
                ))}

              {/* QUIZ */}
              {selectedRecurso.tipo === 'TAREA' &&
                selectedRecurso.titulo?.startsWith('[QUIZ]') &&
                (viewOnlyMode ? (
                  <div className="space-y-4">
                    {selectedRecurso.contenido_html && (
                      <div
                        className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-6 border border-border/50 shadow-sm"
                        dangerouslySetInnerHTML={sanitizeHTML(selectedRecurso.contenido_html)}
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
                  <QuizPlayer
                    recurso_guid={selectedRecurso.guid}
                    bloque_titulo={selectedRecurso.titulo.replace('[QUIZ] ', '')}
                    instrucciones_html={selectedRecurso.contenido_html || ''}
                    url_referencia={selectedRecurso.url_referencia}
                    archivo_adjunto_url={selectedRecurso.archivo_adjunto_url}
                    archivo_adjunto_nombre={selectedRecurso.archivo_adjunto_nombre}
                    onFinish={async (success) => {
                      await fetchProgreso();
                      if (success === false && curso && selectedRecurso) {
                        for (const m of curso.modulos) {
                          if (
                            (m.recursos || []).some((r: any) => r.guid === selectedRecurso.guid)
                          ) {
                            const firstResource = (m.recursos || [])[0];
                            if (firstResource) {
                              setSelectedRecurso(firstResource);
                            }
                            return;
                          }
                        }
                      }
                    }}
                    onQuizStateChange={(active) => setIsQuizActive(active)}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Course Completion Celebration Modal ── */}
      {showCelebration && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          {/* Confetti particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-5%`,
                  backgroundColor: [
                    '#4f46e5',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6',
                    '#06b6d4',
                    '#ec4899',
                    '#f97316',
                  ][i % 8],
                  animation: `confettiFall ${2 + Math.random() * 3}s ease-in-out ${Math.random() * 2}s infinite`,
                  opacity: 0.8,
                  width: `${4 + Math.random() * 8}px`,
                  height: `${4 + Math.random() * 8}px`,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                }}
              />
            ))}
          </div>

          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 relative z-10">
            {/* Gradient header */}
            <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-500/10 p-10 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-amber-500 to-emerald-500" />
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/5 rounded-full" />
              <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-emerald-500/5 rounded-full" />

              <div className="relative z-10">
                <div
                  className="w-24 h-24 bg-gradient-to-br from-primary/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-background shadow-xl"
                  style={{ animation: 'bounce 2s infinite' }}
                >
                  <Award className="h-12 w-12 text-primary" />
                </div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <h2 className="text-2xl font-black text-foreground">¡Felicidades!</h2>
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">Has completado exitosamente el curso</p>
                <p className="text-primary font-bold text-lg mt-1">{celebrationData?.curso_titulo || curso?.titulo}</p>
              </div>
            </div>

            {/* Certificate actions — fade in after 2s delay for dramatic effect */}
            <div
              className="p-6 text-center transition-all duration-700 ease-out"
              style={{
                opacity: showCelebrationActions ? 1 : 0,
                transform: showCelebrationActions ? 'translateY(0)' : 'translateY(12px)',
                maxHeight: showCelebrationActions ? '300px' : '0px',
                overflow: 'hidden',
                padding: showCelebrationActions ? undefined : '0 1.5rem',
              }}
            >
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                Tu certificado de finalización ya ha sido generado y está disponible para descargar en formato PDF.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCelebration(false)}
                  className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3.5 rounded-xl transition-colors text-sm"
                >
                  Seguir en el curso
                </button>
                <button
                  onClick={() => {
                    setShowCelebration(false);
                    router.push('/dashboard/student/certificados');
                  }}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 text-sm"
                >
                  <Award className="h-4 w-4" /> Ver Certificado
                </button>
              </div>
            </div>
          </div>

          {/* Confetti CSS */}
          <style>{`
            @keyframes confettiFall {
              0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {/* ── Pending Grading Modal ── */}
      {showPendingModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="relative bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-orange-500/10 p-8 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/5 rounded-full" />

              <div className="relative z-10">
                <div className="w-20 h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-background shadow-xl">
                  <Clock className="h-10 w-10 text-amber-500" />
                </div>
                <h2 className="text-xl font-black text-foreground mb-2">Curso Completado</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Has terminado todos los recursos, pero hay tareas pendientes de calificación.
                </p>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-5">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2">
                  ⏳ {tareasPendientes.length} tarea(s) esperando calificación:
                </p>
                <ul className="space-y-1.5">
                  {tareasPendientes.map((t, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="font-medium text-foreground">{t.tarea_titulo}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-muted-foreground text-sm mb-6 leading-relaxed text-center">
                Tu certificado se generará <strong className="text-foreground">automáticamente</strong> cuando el
                examinador califique todas las tareas pendientes. Puedes comunicarte con él a través de la sección de
                mensajes.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPendingModal(false)}
                  className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3.5 rounded-xl transition-colors text-sm"
                >
                  Entendido
                </button>
                <button
                  onClick={() => {
                    setShowPendingModal(false);
                    router.push('/dashboard/mensajes');
                  }}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 text-sm"
                >
                  Ir a Mensajes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
