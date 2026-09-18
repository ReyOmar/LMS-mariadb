'use client';

import { useEffect, useState, useRef } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime, useRealtime } from '@/contexts/RealtimeContext';
import { useBloqueoDeCurso } from '@/hooks/useBloqueoDeCurso';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  Plus,
  BookOpen,
  Layers,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  UserCheck,
  Image as ImageIcon,
  Type,
  FileText,
  CheckCircle,
  UploadCloud,
  Save,
  X,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  AlertTriangle,
  Paperclip,
  ExternalLink,
  Clock,
  RefreshCcw,
  Lock,
  Unlock,
  Search,
  Loader2,
  Download,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { mensajeDeError, urlDeArchivo, urlDeMarca } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import { sanitizeHTML } from '@/lib/sanitize';

export default function ConstructorCursosRoot() {
  const { role, user } = useRole();
  const { cursosEnEdicion } = useRealtime();
  const { showAlert, showConfirm } = useAlert();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [activeCourse, setActiveCourse] = useState<any>(null);

  // Examiner assignment state
  const [profesores, setProfesores] = useState<any[]>([]);
  const [selectedProfesorGuid, setSelectedProfesorGuid] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Cover upload state
  const [uploadingCover, setUploadingCover] = useState(false);

  // States for new UI Layout
  const [savingCourse, setSavingCourse] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<{
    type: 'MODULE' | 'RESOURCE' | null;
    data: any;
    moduloId?: string;
  }>({ type: null, data: null });
  const [menuOpenForModule, setMenuOpenForModule] = useState<string | null>(null);

  // States for block editing inside the main panel
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [bloqueTipo, setBloqueTipo] = useState<'PARRAFO' | 'IMAGEN' | 'TAREA' | 'CUESTIONARIO' | 'ENLACE' | null>(null);
  const [bloqueTitulo, setBloqueTitulo] = useState('');
  const [bloqueHtml, setBloqueHtml] = useState('');
  const [bloqueBase64, setBloqueBase64] = useState<string>('');
  const [savingBlock, setSavingBlock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Published course warning modal
  const [publishedWarning, setPublishedWarning] = useState<{ open: boolean; onSwitchDraft: () => void }>({
    open: false,
    onSwitchDraft: () => {},
  });

  const [exitReminder, setExitReminder] = useState(false);

  // DND States
  const [draggedItem, setDraggedItem] = useState<{ guid: string; moduloId: string; index: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ guid: string; moduloId: string; index: number } | null>(null);

  // Mobile temario toggle
  const [showTemario, setShowTemario] = useState(false);

  // Active course locking state
  // Aviso cooperativo: toma el curso al abrirlo y lo libera al salir.
  const editorInfo = useBloqueoDeCurso(activeCourse?.guid);
  const isLockedByOtherActive = Boolean(editorInfo);
  const isReadOnly = activeCourse?.estado === 'PUBLICADO';

  const handleReorder = async (moduloId: string, startIndex: number, endIndex: number) => {
    if (isReadOnly || startIndex === endIndex) return;
    const mod = activeCourse.modulos.find((m: any) => m.guid === moduloId);
    if (!mod) return;

    const recursos = [...(mod.recursos || [])];
    const [removed] = recursos.splice(startIndex, 1);
    recursos.splice(endIndex, 0, removed);

    // Actualización optimista
    const updatedModulos = activeCourse.modulos.map((m: any) => {
      if (m.guid === moduloId) {
        return { ...m, recursos };
      }
      return m;
    });
    setActiveCourse({ ...activeCourse, modulos: updatedModulos });

    try {
      const guids = recursos.map((r) => r.guid);
      await api.patch(`/cursos/modulos/${moduloId}/bloques/orden`, { guids });
    } catch (err) {
      console.error(err);
      // Revertir si falla
      const originalCourse = await api.get(`/cursos/${activeCourse.guid}/gestion`).then((r) => r.data);
      setActiveCourse(originalCourse);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProfesores();
    import('@justinribeiro/lite-youtube').catch(console.error);
  }, []);

  // Otro administrador puede crear, borrar o publicar cursos mientras se edita aquí.
  useEventoRealtime('course:created', () => fetchData());
  useEventoRealtime('course:deleted', () => fetchData());
  useEventoRealtime('course:updated', () => fetchData());

  // Avisa antes de cerrar la pestaña con un curso a medio publicar.
  useEffect(() => {
    if (activeCourse?.estado !== 'BORRADOR') return;

    const alSalir = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = 'El curso sigue en Borrador y los alumnos no lo verán. ¿Salir igualmente?';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [activeCourse?.estado]);

  // Intercept client-side navigation (sidebar links) when course is in BORRADOR
  useEffect(() => {
    if (!activeCourse || activeCourse.estado !== 'BORRADOR') return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      // Only intercept internal navigation away from this page
      if (href.includes('/constructor-cursos') || href.includes('/storage/download/')) return;

      e.preventDefault();
      e.stopPropagation();
      setExitReminder(true);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [activeCourse?.guid, activeCourse?.estado]);

  // Guard: check if course is published before allowing edits
  const guardPublished = (callback: () => void) => {
    if (activeCourse?.estado === 'PUBLICADO') {
      setPublishedWarning({
        open: true,
        onSwitchDraft: async () => {
          try {
            await api.patch(`/cursos/${activeCourse.guid}`, { estado: 'BORRADOR' });
            setActiveCourse({ ...activeCourse, estado: 'BORRADOR' });
            fetchData();
            setPublishedWarning({ open: false, onSwitchDraft: () => {} });
            callback();
          } catch (err: any) {
            setPublishedWarning({ open: false, onSwitchDraft: () => {} });
            const msg = err?.response?.data?.message || 'No se pudo cambiar a Borrador.';
            showAlert.warning('No se puede editar este curso', msg);
          }
        },
      });
      return;
    }
    callback();
  };

  // Helper: handle back button with exit reminder
  const handleBackButton = () => {
    if (activeCourse?.estado === 'BORRADOR') {
      setExitReminder(true);
      return;
    }
    exitCourse();
  };

  const exitCourse = () => {
    if (role === 'teacher') {
      router.push('/dashboard');
    } else {
      setActiveCourse(null);
      setSelectedItem({ type: null, data: null });
      setExpandedModules({});
      setMenuOpenForModule(null);
      router.replace(window.location.pathname);
    }
  };

  // Auto-open course from URL query param (when teacher navigates from their dashboard)
  // Also refreshes course data when returning from block editor
  useEffect(() => {
    const cursoParam = searchParams?.get('curso');
    if (cursoParam) {
      // Always fetch fresh course data (handles returning from block editor with updated content)
      api
        .get(`/cursos/${cursoParam}`)
        .then((r) => r.data)
        .then((data) => {
          setActiveCourse(data);

          const resourceId = searchParams?.get('resource');
          const moduleId = searchParams?.get('module');
          if (resourceId && moduleId) {
            const mod = data.modulos?.find((m: any) => m.guid === moduleId);
            if (mod) {
              const rec = (mod.recursos || []).find((r: any) => r.guid === resourceId);
              if (rec) {
                setSelectedItem({ type: 'RESOURCE', data: rec, moduloId: moduleId });
                setExpandedModules((prev) => ({ ...prev, [moduleId]: true }));
                setEditingBlockId(rec.guid);
                let modalType: 'PARRAFO' | 'TAREA' | 'CUESTIONARIO' | 'ENLACE' = 'PARRAFO';
                if (rec.tipo === 'TEXTO') modalType = 'PARRAFO';
                if (rec.tipo === 'ENLACE') modalType = 'ENLACE';
                if (rec.tipo === 'TAREA' && !rec.titulo.startsWith('[QUIZ]')) modalType = 'TAREA';
                if (rec.tipo === 'TAREA' && rec.titulo.startsWith('[QUIZ]')) modalType = 'CUESTIONARIO';
                let cleanTitle = rec.titulo;
                if (modalType === 'CUESTIONARIO') cleanTitle = cleanTitle.replace('[QUIZ] ', '');
                setBloqueTitulo(cleanTitle);
                setBloqueHtml(rec.contenido_html || '');
                if (modalType === 'ENLACE') setBloqueBase64(rec.url_archivo || rec.contenido_html || '');
                setBloqueTipo(modalType);
              }
            }
          }
        })
        .catch(console.error);
    }
    // If teacher lands here without a course param, redirect to dashboard
    if (role === 'teacher' && !cursoParam && !activeCourse) {
      router.replace('/dashboard');
    }
  }, [searchParams, role]);

  const fetchData = async () => {
    try {
      const res = await api.get('/cursos');
      const data = res.data;
      setCursos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCourse) return;

    guardPublished(async () => {
      setUploadingCover(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await api.post('/storage/upload?folder=portadas', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const filename = uploadRes.data.filename;

        await api.patch(`/cursos/${activeCourse.guid}`, {
          imagen_portada: filename,
        });

        setActiveCourse((prev: any) => ({ ...prev, imagen_portada: filename }));
        fetchData();
      } catch (err) {
        console.error(err);
        showAlert.error('Error', 'Error al subir portada.');
      } finally {
        setUploadingCover(false);
      }
    });
  };

  const fetchProfesores = async () => {
    // Only admins can fetch the professors list
    if (role !== 'admin') return;
    try {
      const res = await api.get('/auth/usuarios/por-rol', { params: { rol: 'PROFESOR' } });
      const data = res.data;
      setProfesores(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearCurso = async () => {
    try {
      const res = await api.post('/cursos', { titulo: 'Curso Nuevo', profesor_guid: user?.guid });
      const newCourse = res.data;

      // Optimistic UI update to avoid loading screen freeze
      const fullCourse = { ...newCourse, modulos: [] };
      setActiveCourse(fullCourse);
      setCursos((prev) => [newCourse, ...prev]);
      setSelectedItem({ type: null, data: null });
      setExpandedModules({});
      setMenuOpenForModule(null);

      // Update URL
      router.push(`?curso=${newCourse.guid}`);

      // Fetch full details in background
      api
        .get(`/cursos/${newCourse.guid}`)
        .then((r) => setActiveCourse(r.data))
        .catch(console.error);
    } catch {
      showAlert.error('Error', 'No se pudo crear el curso.');
    }
  };

  const handleCrearModulo = async () => {
    if (!activeCourse) return;
    try {
      await api.post(`/cursos/${activeCourse.guid}/modulos`, {
        titulo: `Módulo ${activeCourse.modulos?.length + 1 || 1} Nuevo`,
      });
      // Refresh course details
      await refreshActiveCourse();
    } catch {
      showAlert.error('Error', 'No se pudo crear el módulo.');
    }
  };

  const refreshActiveCourse = async () => {
    if (!activeCourse) return;
    try {
      const resDetails = await api.get(`/cursos/${activeCourse.guid}/gestion`);
      setActiveCourse(resDetails.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCourseTitle = async (newTitle: string) => {
    if (!activeCourse || isReadOnly) return;
    if (newTitle === activeCourse.titulo) return; // No change
    try {
      await api.patch(`/cursos/${activeCourse.guid}`, { titulo: newTitle });
      setActiveCourse((prev: any) => ({ ...prev, titulo: newTitle }));
      fetchData();
    } catch {
      showAlert.error('Error', 'No se pudo actualizar el título.');
    }
  };

  const handleUpdateModuleTitle = async (moduleId: string, newTitle: string) => {
    if (isReadOnly) return;
    try {
      await api.patch(`/cursos/modulos/${moduleId}`, { titulo: newTitle });
      await refreshActiveCourse();
    } catch {
      showAlert.error('Error', 'No se pudo renombrar el módulo.');
    }
  };

  // --- Handlers from old modal system ---
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/storage/upload?folder=recursos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBloqueBase64(urlDeArchivo(res.data.url) ?? '');
      } catch (err) {
        console.error('Error uploading image:', err);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/storage/upload?folder=recursos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBloqueBase64(urlDeArchivo(res.data.url) ?? '');
      } catch (err) {
        console.error('Error uploading dropped image:', err);
      }
    }
  };

  const openAppEdit = (recurso: any, moduloId: string) => {
    // Toggle logic: If already selected, deselect it
    if (selectedItem.type === 'RESOURCE' && selectedItem.data.guid === recurso.guid) {
      setSelectedItem({ type: null, data: null });
      setEditingBlockId(null);
      return;
    }

    setEditingBlockId(recurso.guid);

    let modalType: 'PARRAFO' | 'TAREA' | 'CUESTIONARIO' | 'ENLACE' = 'PARRAFO';
    if (recurso.tipo === 'TEXTO') modalType = 'PARRAFO';
    if (recurso.tipo === 'ENLACE') modalType = 'ENLACE';
    if (recurso.tipo === 'TAREA' && !recurso.titulo.startsWith('[QUIZ]')) modalType = 'TAREA';
    if (recurso.tipo === 'TAREA' && recurso.titulo.startsWith('[QUIZ]')) modalType = 'CUESTIONARIO';

    let cleanTitle = recurso.titulo;
    if (modalType === 'CUESTIONARIO') cleanTitle = cleanTitle.replace('[QUIZ] ', '');

    setBloqueTitulo(cleanTitle);

    setBloqueHtml(recurso.contenido_html || '');
    if (modalType === 'ENLACE') setBloqueBase64(recurso.url_archivo || recurso.contenido_html || '');

    setBloqueTipo(modalType);
    setSelectedItem({ type: 'RESOURCE', data: recurso, moduloId });
    // Auto-close temario on mobile so the editor is visible
    setShowTemario(false);
  };

  // Helper to ensure URLs are absolute
  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url;
    return `https://${url}`;
  };

  // Helper to render optional extras in preview
  const renderExtrasPreview = (recurso: any) => {
    const extras = [];
    if (recurso?.url_referencia) {
      extras.push(
        <div key="url" className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <ExternalLink className="h-4 w-4 text-primary flex-shrink-0" />
          <a
            href={ensureAbsoluteUrl(recurso.url_referencia)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary font-medium truncate hover:underline"
          >
            {recurso.url_referencia}
          </a>
        </div>,
      );
    }
    if (recurso?.archivo_adjunto_nombre && recurso?.archivo_adjunto) {
      extras.push(
        <a
          key="file"
          href={urlDeArchivo(recurso.archivo_adjunto_url) ?? ''}
          className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl hover:bg-primary/10 hover:border-primary/30 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Paperclip className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-foreground truncate block">{recurso.archivo_adjunto_nombre}</span>
            <span className="text-xs text-muted-foreground">Clic para descargar</span>
          </div>
          <UploadCloud className="h-4 w-4 text-primary rotate-180 flex-shrink-0" />
        </a>,
      );
    }
    if (recurso?.archivo_max_size_mb && recurso.tipo === 'TAREA' && !recurso.titulo?.startsWith('[QUIZ]')) {
      extras.push(
        <div
          key="maxsize"
          className="flex items-center gap-2 p-2 px-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-500"
        >
          <span className="font-bold">Límite de entrega:</span> {recurso.archivo_max_size_mb} MB por estudiante
        </div>,
      );
    }
    if (recurso?.quiz_config) {
      try {
        const qc = JSON.parse(recurso.quiz_config);
        extras.push(
          <div
            key="quiz"
            className="flex items-center gap-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-sm"
          >
            <span className="flex items-center gap-1 font-medium">
              <RefreshCcw className="h-3.5 w-3.5 text-amber-500" /> {qc.intentos_permitidos} intento(s)
            </span>
            <span className="flex items-center gap-1 font-medium">
              <Clock className="h-3.5 w-3.5 text-amber-500" />{' '}
              {qc.tiempo_minutos > 0 ? `${qc.tiempo_minutos} min` : 'Sin límite'}
            </span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle className="h-3.5 w-3.5 text-amber-500" /> {qc.preguntas?.length || 0} pregunta(s)
            </span>
          </div>,
        );
      } catch {}
    }
    return extras.length > 0 ? <div className="space-y-2 mt-4">{extras}</div> : null;
  };

  const handleDeleteBlock = async (id: string) => {
    guardPublished(async () => {
      const ok = await showConfirm(
        'Eliminar recurso',
        '¿Estás seguro de que deseas eliminar este recurso? Esta acción no se puede deshacer.',
      );
      if (!ok) return;
      try {
        await api.delete(`/cursos/bloques/${id}`);

        setActiveCourse((prev: any) => {
          const newCourse = { ...prev };
          newCourse.modulos = newCourse.modulos.map((m: any) => {
            const newM = { ...m };
            if (newM.recursos) {
              newM.recursos = newM.recursos.filter((r: any) => r.guid !== id);
            }
            return newM;
          });
          return newCourse;
        });

        setSelectedItem({ type: null, data: null });
      } catch {
        showAlert.error('Error', 'No se pudo eliminar el recurso.');
      }
    });
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const startNewBlock = async (moduleId: string, tipo: 'PARRAFO' | 'IMAGEN' | 'TAREA' | 'CUESTIONARIO' | 'ENLACE') => {
    guardPublished(async () => {
      let finalTipo = tipo === 'IMAGEN' ? 'ENLACE' : tipo === 'PARRAFO' ? 'TEXTO' : tipo;
      let finalTitulo =
        tipo === 'PARRAFO' ? 'Bloque de Texto' : tipo === 'IMAGEN' ? 'Imagen' : tipo === 'ENLACE' ? 'Video' : tipo;

      if (tipo === 'CUESTIONARIO') {
        finalTipo = 'TAREA';
        finalTitulo = `[QUIZ] Cuestionario`;
      }

      try {
        const res = await api.post(`/cursos/modulos/${moduleId}/bloques`, {
          tipo: finalTipo,
          titulo: finalTitulo,
          contenido_html: '',
        });
        const newBlock = res.data;
        router.push(`/dashboard/constructor-cursos/${activeCourse.guid}/modulos/${moduleId}/bloques/${newBlock.guid}`);
      } catch (e) {
        console.error(e);
      }
    });
  };

  if (role !== 'admin' && role !== 'teacher') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] animate-in fade-in">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Acceso Restringido</h1>
      </div>
    );
  }

  if (loading) {
    return <PageLoader message="Cargando constructor de cursos..." />;
  }

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 h-[calc(100vh-6rem)] flex flex-col">
      {!activeCourse && (
        <header className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Constructor Maestro{' '}
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full font-bold uppercase tracking-wider">
              Edición Estructurada
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Estructura jerárquica de cursos: Curso {'->'} Módulo {'->'} Bloques
          </p>
        </header>
      )}

      {cursos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-2xl border border-border/50 shadow-sm border-dashed">
          <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-6" />
          {role === 'admin' ? (
            <>
              <h3 className="text-xl font-bold text-foreground mb-2">No hay cursos creados</h3>
              <p className="text-muted-foreground mb-8 text-center max-w-sm">
                Comienza agregando tu primer curso a la plataforma para empezar a estructurar el conocimiento.
              </p>
              <button
                type="button"
                onClick={handleCrearCurso}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-md transition-transform hover:-translate-y-1"
              >
                <Plus className="h-5 w-5" /> Crear Primer Curso
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-foreground mb-2">Sin cursos asignados</h3>
              <p className="text-muted-foreground mb-4 text-center max-w-sm">
                Aún no tienes cursos asignados. Contacta con un administrador para que te asigne cursos para supervisar
                y editar.
              </p>
            </>
          )}
        </div>
      ) : activeCourse ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          {/* Header for Active Course */}
          <div className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleBackButton}
                className="p-2 bg-muted rounded-full hover:bg-border transition-colors shrink-0"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              <h1 className="font-bold text-lg sm:text-2xl leading-none text-foreground truncate">
                {activeCourse.titulo}
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <div className="relative group/status">
                <select
                  value={activeCourse.estado}
                  onChange={async (e) => {
                    const newEstado = e.target.value;
                    try {
                      await api.patch(`/cursos/${activeCourse.guid}`, { estado: newEstado });
                      setActiveCourse({ ...activeCourse, estado: newEstado });
                      fetchData();
                    } catch (err: any) {
                      const msg = err?.response?.data?.message || 'No se pudo cambiar el estado.';
                      showAlert.warning('No se puede cambiar el estado', msg);
                      // Reset select back to current state
                      e.target.value = activeCourse.estado;
                    }
                  }}
                  className={`appearance-none pl-8 sm:pl-10 pr-8 sm:pr-10 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest transition-all cursor-pointer border shadow-sm focus:outline-none focus:ring-4 ${
                    activeCourse.estado === 'PUBLICADO'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 focus:ring-emerald-500/20'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-600 focus:ring-amber-500/20'
                  }`}
                >
                  <option value="BORRADOR">Borrador</option>
                  <option value="PUBLICADO">Publicado</option>
                </select>
                <div
                  className={`absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${activeCourse.estado === 'PUBLICADO' ? 'text-emerald-500' : 'text-amber-500'}`}
                >
                  {activeCourse.estado === 'PUBLICADO' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </div>
                <div
                  className={`absolute right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${activeCourse.estado === 'PUBLICADO' ? 'text-emerald-500' : 'text-amber-500'}`}
                >
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>

              {role === 'admin' && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (isReadOnly) return;
                    const ok = await showConfirm(
                      'Eliminar curso',
                      '¿Estás seguro de eliminar este curso por completo? Se borrarán todos los módulos y recursos asociados.',
                    );
                    if (ok) {
                      try {
                        await api.delete(`/cursos/${activeCourse.guid}`);

                        const deletedGuid = activeCourse.guid;
                        setActiveCourse(null);
                        setSelectedItem({ type: null, data: null });
                        setExpandedModules({});
                        setMenuOpenForModule(null);
                        setCursos((prev) => prev.filter((c) => c.guid !== deletedGuid));
                        window.history.replaceState({}, '', window.location.pathname);
                      } catch {
                        showAlert.error('Error', 'No se pudo eliminar el curso.');
                      }
                    }
                  }}
                  className={`font-bold px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl shadow-md transition-transform flex items-center gap-2 ${
                    isReadOnly
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-red-500 hover:bg-red-600 text-white hover:-translate-y-0.5'
                  }`}
                >
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">Eliminar curso</span>
                </button>
              )}
            </div>
          </div>

          {isReadOnly && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center gap-3">
              <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                Este curso está publicado. Cambia a estado Borrador para editar contenido.
              </p>
            </div>
          )}
          <div className="flex flex-1 h-[calc(100%-80px)] overflow-hidden">
            {/* Main Content Panel (Left/Center) */}
            <div className="flex-1 bg-muted/10 overflow-y-auto p-4 sm:p-8 relative">
              {!selectedItem.type ? (
                <div className="max-w-3xl mx-auto w-full flex flex-col items-center justify-center pt-10">
                  <h2 className="text-2xl font-bold mb-8 text-foreground">Configuración General del Curso</h2>

                  <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-start gap-4">
                    <div className="w-full">
                      <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" /> Nombre del Curso
                      </h3>
                      <input
                        type="text"
                        defaultValue={activeCourse.titulo}
                        readOnly={isReadOnly}
                        onBlur={(e) => handleUpdateCourseTitle(e.target.value)}
                        className={`w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg transition-colors text-foreground ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                        placeholder="Ingresa el nombre del curso"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Este nombre será visible para todos los usuarios matriculados.
                      </p>
                    </div>
                  </div>

                  <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-center">
                    <h3 className="text-lg font-bold mb-4 w-full text-left">Portada del Curso</h3>
                    <div className="w-full max-w-md h-56 bg-muted rounded-xl border-2 border-dashed border-border flex items-center justify-center relative overflow-hidden group">
                      {activeCourse.imagen_portada ? (
                        <>
                          <img
                            src={urlDeMarca(activeCourse.imagen_portada) ?? ''}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <a
                              href={urlDeMarca(activeCourse.imagen_portada) ?? ''}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 bg-primary hover:bg-primary/90 text-white rounded-lg shadow-md transition-colors"
                              title="Descargar Portada"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                guardPublished(async () => {
                                  try {
                                    await api.patch(`/cursos/${activeCourse.guid}`, { imagen_portada: null });
                                    setActiveCourse((prev: any) => ({ ...prev, imagen_portada: null }));
                                    fetchData();
                                  } catch {
                                    showAlert.error('Error', 'No se pudo eliminar la portada.');
                                  }
                                });
                              }}
                              className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-md transition-colors"
                              title="Eliminar Portada"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-muted-foreground opacity-60">
                          <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                          <span className="text-sm font-medium">Sin portada</span>
                        </div>
                      )}
                      <label className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer backdrop-blur-[2px]">
                        {uploadingCover ? (
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        ) : (
                          <>
                            <UploadCloud className="h-8 w-8 text-primary mb-2" />
                            <span className="font-bold text-foreground">Subir nueva portada</span>
                            <span className="text-xs text-muted-foreground mt-1">PNG, JPG recomendado</span>
                          </>
                        )}
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleUploadCover}
                          disabled={uploadingCover || isReadOnly}
                        />
                      </label>
                    </div>
                    <p className="text-center w-full mt-6 text-sm text-muted-foreground">
                      Esta imagen se mostrará en los tableros de los estudiantes, examinadores y administradores.
                    </p>
                  </div>
                </div>
              ) : selectedItem.type === 'MODULE' ? (
                <div className="max-w-3xl mx-auto bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3 mb-6">
                    <Layers className="h-6 w-6 text-primary" /> Configuración del Módulo
                  </h2>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">
                    Nombre del Módulo
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedItem.data.titulo}
                    readOnly={isReadOnly}
                    onBlur={(e) => handleUpdateModuleTitle(selectedItem.data.guid, e.target.value)}
                    className={`w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-sm text-muted-foreground mt-4">
                    Este módulo contiene {selectedItem.data.lecciones?.[0]?.recursos?.length || 0} recursos o tareas.
                    Utiliza el panel lateral para añadir más contenido.
                  </p>
                </div>
              ) : selectedItem.type === 'RESOURCE' && bloqueTipo ? (
                <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden h-full max-h-full">
                  <div className="p-3 sm:p-4 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
                    <h3 className="font-bold flex items-center gap-2 text-sm sm:text-base min-w-0">
                      {bloqueTipo === 'PARRAFO' && <Type className="h-4 sm:h-5 w-4 sm:w-5 text-primary shrink-0" />}
                      {bloqueTipo === 'ENLACE' && (
                        <PlayCircle className="h-4 sm:h-5 w-4 sm:w-5 text-pink-500 shrink-0" />
                      )}
                      {bloqueTipo === 'TAREA' && <FileText className="h-4 sm:h-5 w-4 sm:w-5 text-blue-500 shrink-0" />}
                      {bloqueTipo === 'CUESTIONARIO' && (
                        <CheckCircle className="h-4 sm:h-5 w-4 sm:w-5 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate">{bloqueTitulo || 'Sin título'}</span>
                    </h3>
                    {editingBlockId && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={async (e) => {
                            e.preventDefault();
                            if (isReadOnly) return;
                            router.push(
                              `/dashboard/constructor-cursos/${activeCourse.guid}/modulos/${selectedItem.moduloId}/bloques/${editingBlockId}`,
                            );
                          }}
                          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors ${isReadOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                        >
                          <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">{isReadOnly ? 'Solo lectura' : 'Editar Contenido'}</span>
                          <span className="sm:hidden">{isReadOnly ? 'Lectura' : 'Editar'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => !isReadOnly && handleDeleteBlock(editingBlockId)}
                          className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1 transition-colors ${isReadOnly ? 'text-muted-foreground bg-muted cursor-not-allowed' : 'text-red-500 hover:text-red-600 bg-red-500/10'}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-8 overflow-y-auto flex-1 space-y-8 bg-background">
                    {bloqueTipo === 'PARRAFO' && (
                      <>
                        <div
                          className="prose dark:prose-invert max-w-none bg-muted/10 p-8 rounded-2xl border border-border/50 shadow-inner"
                          dangerouslySetInnerHTML={sanitizeHTML(
                            bloqueHtml || '<p class="text-muted-foreground italic">Sin contenido escrito.</p>',
                          )}
                        />
                        {selectedItem.data && renderExtrasPreview(selectedItem.data)}
                      </>
                    )}

                    {bloqueTipo === 'ENLACE' && (
                      <div className="flex flex-col items-center">
                        {bloqueHtml && bloqueHtml.includes('youtube.com/watch?v=') && (
                          <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-border shadow-sm">
                            {/* @ts-ignore */}
                            <lite-youtube videoid={new URL(bloqueHtml).searchParams.get('v')}></lite-youtube>
                          </div>
                        )}
                        {bloqueHtml && bloqueHtml.includes('youtu.be/') && (
                          <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-border shadow-sm">
                            {/* @ts-ignore */}
                            <lite-youtube videoid={bloqueHtml.split('youtu.be/')[1].split('?')[0]}></lite-youtube>
                          </div>
                        )}
                        {!bloqueHtml && (
                          <div className="w-full max-w-3xl h-64 bg-muted/20 border border-border border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground">
                            <PlayCircle className="h-12 w-12 opacity-30 mb-4" />
                            <p>Video de YouTube no configurado. Haz clic en "Editar Contenido".</p>
                          </div>
                        )}
                      </div>
                    )}

                    {bloqueTipo === 'TAREA' && (
                      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-3xl mx-auto">
                        <div className="p-6 border-b border-border bg-muted/10">
                          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">
                            Instrucciones de la Tarea
                          </h3>
                          <div
                            className="prose dark:prose-invert max-w-none text-foreground"
                            dangerouslySetInnerHTML={sanitizeHTML(
                              bloqueHtml ||
                                '<p class="text-muted-foreground italic opacity-70">No hay instrucciones definidas.</p>',
                            )}
                          />
                          {selectedItem.data && renderExtrasPreview(selectedItem.data)}
                        </div>
                        <div className="p-8 flex flex-col items-center justify-center text-center">
                          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <UploadCloud className="h-10 w-10 text-primary" />
                          </div>
                          <h3 className="font-bold text-xl mb-2">Área de Entrega</h3>
                          <p className="text-muted-foreground text-sm max-w-md mb-8">
                            Esta es una simulación visual. Al realizar el curso, el estudiante verá este espacio para
                            subir su respuesta.
                          </p>
                          <button
                            disabled
                            className="bg-primary/50 text-white px-8 py-3 rounded-xl font-bold cursor-not-allowed"
                          >
                            Subir Archivo
                          </button>
                        </div>
                      </div>
                    )}

                    {bloqueTipo === 'CUESTIONARIO' && (
                      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-3xl mx-auto">
                        <div className="p-6 border-b border-border bg-amber-500/10">
                          <h3 className="font-bold text-sm text-amber-700 dark:text-amber-500 uppercase tracking-wider mb-4">
                            Instrucciones del Cuestionario
                          </h3>
                          <div
                            className="prose dark:prose-invert max-w-none text-foreground"
                            dangerouslySetInnerHTML={sanitizeHTML(
                              bloqueHtml ||
                                '<p class="text-muted-foreground italic opacity-70">No hay instrucciones definidas.</p>',
                            )}
                          />
                          {selectedItem.data && renderExtrasPreview(selectedItem.data)}
                        </div>
                        <div className="p-8 flex flex-col items-center justify-center text-center">
                          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="h-10 w-10 text-amber-500" />
                          </div>
                          <h3 className="font-bold text-xl mb-2">Cuestionario Interactivo</h3>
                          <p className="text-muted-foreground text-sm max-w-md mb-8">
                            Esta es una simulación visual. Al realizar el curso, el estudiante accederá al cuestionario
                            interactivo desde aquí.
                          </p>
                          <button
                            disabled
                            className="bg-amber-500/50 text-white px-8 py-3 rounded-xl font-bold cursor-not-allowed"
                          >
                            Comenzar Intento
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Mobile Temario Toggle Button */}
            <button
              type="button"
              onClick={() => setShowTemario(!showTemario)}
              className="lg:hidden fixed bottom-6 right-6 z-30 h-14 w-14 bg-primary text-primary-foreground rounded-full shadow-xl flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
              title="Temario del curso"
            >
              <Layers className="h-6 w-6" />
            </button>

            {/* Mobile Temario Backdrop */}
            {showTemario && (
              <div
                className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={() => setShowTemario(false)}
              />
            )}

            {/* Right Sidebar (Temario del curso) */}
            <div
              className={`w-[350px] max-w-[85vw] bg-card border-l border-border overflow-y-auto flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-50 fixed lg:relative right-0 top-0 h-full lg:h-auto transition-transform duration-300 ease-in-out ${showTemario ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
            >
              <div className="p-5 border-b border-border sticky top-0 bg-inherit z-10 flex items-center justify-between">
                <h2 className="font-bold text-lg tracking-tight flex items-center gap-2 uppercase text-muted-foreground">
                  <Layers className="h-5 w-5" /> Temario del Curso
                </h2>
                <button
                  type="button"
                  onClick={() => setShowTemario(false)}
                  className="lg:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 flex-1 space-y-4">
                {!activeCourse.modulos || activeCourse.modulos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No hay módulos creados aún.</div>
                ) : (
                  activeCourse.modulos.map((mod: any, i: number) => {
                    const isExpanded = expandedModules[mod.guid];
                    const recursos = mod.lecciones?.[0]?.recursos || [];

                    return (
                      <div key={mod.guid} className="border border-border/50 rounded-xl bg-muted/5">
                        {/* Module Header */}
                        <div
                          className={`flex items-center justify-between p-3 hover:bg-muted/30 transition-colors ${selectedItem.type === 'MODULE' && selectedItem.data.guid === mod.guid ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleModule(mod.guid);
                              }}
                              className="p-1 bg-background border border-border shadow-sm hover:border-primary/50 hover:bg-muted rounded-md transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                            <div
                              className="font-bold text-sm truncate flex-1 cursor-pointer"
                              onClick={() => {
                                if (selectedItem.type === 'MODULE' && selectedItem.data.guid === mod.guid) {
                                  setSelectedItem({ type: null, data: null });
                                  setMenuOpenForModule(null);
                                } else {
                                  setSelectedItem({ type: 'MODULE', data: mod });
                                }
                              }}
                            >
                              {mod.titulo}
                            </div>
                          </div>
                          <div className="relative flex items-center gap-1">
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const ok = await showConfirm(
                                    'Eliminar módulo',
                                    `¿Eliminar el módulo "${mod.titulo}"? Todo su contenido será borrado permanentemente.`,
                                  );
                                  if (ok) {
                                    try {
                                      await api.delete(`/cursos/modulos/${mod.guid}`);

                                      setActiveCourse((prev: any) => ({
                                        ...prev,
                                        modulos: prev.modulos.filter((m: any) => m.guid !== mod.guid),
                                      }));

                                      if (selectedItem.type === 'MODULE' && selectedItem.data.guid === mod.guid) {
                                        setSelectedItem({ type: null, data: null });
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="p-1.5 bg-red-500/10 rounded border border-red-500/20 shadow-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                title="Eliminar módulo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setMenuOpenForModule(menuOpenForModule === mod.guid ? null : mod.guid);
                                }}
                                className="p-1.5 bg-background rounded border border-border shadow-sm text-muted-foreground hover:text-primary transition-colors hover:border-primary/30"
                                title="Añadir tarea a este módulo"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}

                            {/* Dropdown Add Task */}
                            {menuOpenForModule === mod.guid && (
                              <div className="absolute right-0 top-10 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
                                <div className="p-2 text-xs font-bold text-muted-foreground border-b border-border/50 bg-muted/30">
                                  Añadir Recurso
                                </div>
                                <div className="p-1">
                                  <button
                                    onClick={() => startNewBlock(mod.guid, 'ENLACE')}
                                    className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
                                  >
                                    <PlayCircle className="h-4 w-4 text-pink-500" /> Video / Enlace
                                  </button>
                                  <button
                                    onClick={() => startNewBlock(mod.guid, 'PARRAFO')}
                                    className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
                                  >
                                    <Type className="h-4 w-4 text-primary" /> Texto
                                  </button>
                                  <button
                                    onClick={() => startNewBlock(mod.guid, 'CUESTIONARIO')}
                                    className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
                                  >
                                    <CheckCircle className="h-4 w-4 text-amber-500" /> Quiz
                                  </button>
                                  <button
                                    onClick={() => startNewBlock(mod.guid, 'TAREA')}
                                    className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
                                  >
                                    <FileText className="h-4 w-4 text-blue-500" /> Tarea
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Module Content (Resources) */}
                        {isExpanded && (
                          <div className="bg-background border-t border-border/30 px-3 py-2 space-y-1">
                            {recursos.length === 0 ? (
                              <div className="text-xs text-muted-foreground py-2 italic text-center">Vacío</div>
                            ) : (
                              recursos.map((r: any, rIndex: number) => {
                                const isQuiz = r.tipo === 'TAREA' && r.titulo.startsWith('[QUIZ]');
                                const displayTitle = isQuiz ? r.titulo.replace('[QUIZ] ', '') : r.titulo;
                                const isSelected =
                                  selectedItem.type === 'RESOURCE' && selectedItem.data.guid === r.guid;

                                const isDragging = draggedItem?.guid === r.guid;
                                const isDragOver = dragOverItem?.guid === r.guid;

                                return (
                                  <div
                                    key={r.guid}
                                    draggable={activeCourse?.estado === 'BORRADOR'}
                                    onDragStart={(e) => {
                                      e.dataTransfer.effectAllowed = 'move';
                                      setDraggedItem({ guid: r.guid, moduloId: mod.guid, index: rIndex });
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'move';
                                      if (draggedItem?.moduloId === mod.guid && draggedItem?.guid !== r.guid) {
                                        setDragOverItem({ guid: r.guid, moduloId: mod.guid, index: rIndex });
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (
                                        draggedItem &&
                                        dragOverItem &&
                                        draggedItem.moduloId === mod.guid &&
                                        dragOverItem.moduloId === mod.guid
                                      ) {
                                        handleReorder(mod.guid, draggedItem.index, dragOverItem.index);
                                      }
                                      setDraggedItem(null);
                                      setDragOverItem(null);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedItem(null);
                                      setDragOverItem(null);
                                    }}
                                    onClick={() => openAppEdit(r, mod.guid)}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all text-sm ${isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-muted-foreground hover:text-foreground'} ${isDragging ? 'opacity-50 border border-dashed border-primary' : ''} ${isDragOver ? 'border-t-2 border-t-primary' : ''}`}
                                  >
                                    {r.tipo === 'TEXTO' && <Type className="h-4 w-4 shrink-0" />}
                                    {r.tipo === 'ENLACE' &&
                                      (r.contenido_html?.startsWith('data:image') ||
                                        r.url_archivo?.startsWith('data:image')) && (
                                        <ImageIcon className="h-4 w-4 shrink-0" />
                                      )}
                                    {r.tipo === 'ENLACE' &&
                                      !(
                                        r.contenido_html?.startsWith('data:image') ||
                                        r.url_archivo?.startsWith('data:image')
                                      ) && <PlayCircle className="h-4 w-4 shrink-0" />}
                                    {r.tipo === 'TAREA' && !isQuiz && <FileText className="h-4 w-4 shrink-0" />}
                                    {r.tipo === 'TAREA' && isQuiz && <CheckCircle className="h-4 w-4 shrink-0" />}

                                    <span className="truncate flex-1">{displayTitle}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {!isReadOnly && (
                  <button
                    onClick={handleCrearModulo}
                    className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors font-bold text-sm"
                  >
                    <Plus className="h-4 w-4" /> Agregar Módulo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar curso por título..."
                className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
              />
            </div>
            <div className="relative w-full sm:w-[200px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
              >
                <option value="todos">Todos los estados</option>
                <option value="PUBLICADO">Publicados</option>
                <option value="BORRADOR">Borradores</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Botón rápido Crear Curso — solo admins */}
            {role === 'admin' && (
              <button
                onClick={handleCrearCurso}
                className="min-h-[200px] border-2 border-dashed border-primary/50 bg-primary/5 rounded-2xl flex flex-col items-center justify-center hover:bg-primary/10 transition-colors group"
              >
                <Plus className="h-8 w-8 text-primary mb-2 group-hover:scale-125 transition-transform" />
                <span className="font-bold text-primary">Crear Nuevo Curso</span>
              </button>
            )}

            {cursos
              .filter(
                (c) =>
                  c.titulo.toLowerCase().includes(search.toLowerCase()) &&
                  (statusFilter === 'todos' || c.estado === statusFilter),
              )
              .map((curso) => {
                const editorInfo = cursosEnEdicion[curso.guid];
                const isLockedByOther = Boolean(editorInfo) && editorInfo.guid !== user?.guid;

                return (
                  <div
                    key={curso.guid}
                    onClick={async () => {
                      if (isLockedByOther) return;
                      setLoading(true);
                      try {
                        const resDetails = await api.get(`/cursos/${curso.guid}`);
                        const data = resDetails.data;
                        setActiveCourse(data);
                        setSelectedItem({ type: null, data: null });
                        setExpandedModules({});
                        setMenuOpenForModule(null);
                        router.push(`?curso=${curso.guid}`);
                      } catch (e) {
                        console.error(e);
                      }
                      setLoading(false);
                    }}
                    className={`bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative ${
                      isLockedByOther
                        ? 'opacity-50 grayscale cursor-not-allowed'
                        : 'hover:shadow-md hover:border-primary/50 group cursor-pointer'
                    }`}
                  >
                    {/* Lock overlay */}
                    {isLockedByOther && (
                      <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
                        <div className="bg-card/90 backdrop-blur-sm border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Lock className="h-4 w-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">En edición</p>
                            <p className="text-[11px] text-muted-foreground">
                              {editorInfo.rol}: {editorInfo.nombre}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="h-32 bg-primary/10 relative flex items-center justify-center overflow-hidden">
                      {curso.imagen_portada ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={urlDeMarca(curso.imagen_portada) ?? ''}
                          alt={curso.titulo}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
                      )}
                      <div className="absolute inset-0 border-b border-border/30" />
                    </div>
                    <div className="p-5">
                      <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {curso.titulo}
                      </h2>
                      <div className="flex justify-between items-center mt-6">
                        <div
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                            curso.estado === 'PUBLICADO'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}
                        >
                          {curso.estado === 'PUBLICADO' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {curso.estado}
                        </div>
                        {isLockedByOther ? (
                          <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Bloqueado
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
                            Editar <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ===== PUBLISHED COURSE WARNING MODAL ===== */}
      {publishedWarning.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-500/15 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Curso Publicado</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Este curso está publicado y es visible para los estudiantes. Para editarlo, debes cambiarlo a estado
                Borrador primero.
                <br />
                <br />
                <strong className="text-foreground">
                  Los estudiantes matriculados y su progreso no se verán afectados.
                </strong>
              </p>
            </div>
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPublishedWarning({ open: false, onSwitchDraft: () => {} })}
                className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={publishedWarning.onSwitchDraft}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors shadow-md"
              >
                Cambiar a Borrador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EXIT REMINDER MODAL ===== */}
      {exitReminder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-500/15 rounded-full flex items-center justify-center mb-4">
                <Eye className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Curso en Borrador</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Este curso está en estado <strong className="text-foreground">Borrador</strong> y no será visible para
                los estudiantes.
                <br />
                <br />
                ¿Deseas publicarlo ahora para que sea accesible?
              </p>
            </div>
            <div className="px-6 pb-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  const courseGuid = activeCourse.guid;
                  setExitReminder(false);
                  // Set activeCourse to null BEFORE the API call completes
                  // to prevent WS events from re-opening the course
                  setActiveCourse(null);
                  setSelectedItem({ type: null, data: null });
                  setExpandedModules({});
                  setMenuOpenForModule(null);
                  try {
                    await api.patch(`/cursos/${courseGuid}`, { estado: 'PUBLICADO' });
                  } catch (err) {
                    console.error(err);
                  }
                  fetchData();
                  if (role === 'teacher') {
                    router.push('/dashboard');
                  } else {
                    router.replace(window.location.pathname);
                  }
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md"
              >
                Publicar y Salir
              </button>
              <button
                type="button"
                onClick={() => {
                  setExitReminder(false);
                  exitCourse();
                }}
                className="w-full bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors"
              >
                Salir sin publicar
              </button>
              <button
                type="button"
                onClick={() => setExitReminder(false)}
                className="w-full text-muted-foreground hover:text-foreground font-medium py-2 text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== KICK OUT MODAL ===== */}
      {isLockedByOtherActive && activeCourse && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Curso en Edición</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                El{' '}
                <strong className="text-foreground">
                  {editorInfo?.rol} {editorInfo?.nombre}
                </strong>{' '}
                está editando el curso <strong className="text-foreground">{activeCourse.titulo}</strong>.
                <br />
                <br />
                En breve podrás acceder nuevamente cuando termine la edición.
              </p>
            </div>
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => {
                  setActiveCourse(null);
                  setSelectedItem({ type: null, data: null });
                  setExpandedModules({});
                  setMenuOpenForModule(null);
                  if (role === 'teacher') {
                    router.push('/dashboard');
                  } else {
                    router.replace(window.location.pathname);
                  }
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md"
              >
                {role === 'teacher' ? 'Volver a Cursos Asignados' : 'Volver a Gestión de Cursos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
