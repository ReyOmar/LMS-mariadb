'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Layers, ShieldAlert } from 'lucide-react';

import api, { errorMessage, uploadFile } from '@/lib/api';
import { uploadLimit } from '@/lib/upload-limits';
import { useSession } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useCourseLock } from '@/hooks/useCourseLock';
import { PageLoader } from '@/components/ui/PageLoader';
import { CourseCatalog } from '@/components/features/CourseCatalog';
import type { Course, CourseStatus, CourseModule, Resource } from '@/types/models';

import { CourseInUseAlert, CoursePublishedAlert, DraftExitAlert } from './components/Notices';
import { CourseHeader } from './components/CourseHeader';
import { NoCourses } from './components/NoCourses';
import { CourseSettings } from './components/CourseSettings';
import { ModuleSettings } from './components/ModuleSettings';
import { CourseOutline, type Selection } from './components/CourseOutline';
import { ResourcePreview } from './components/ResourcePreview';
import { newResource, type ResourceKind } from './components/resources';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';

const NONE: Selection = { type: 'NONE' };

/**
 * Constructor de cursos.
 *
 * Esta pantalla coordina; lo que se ve vive en `components/`. Aquí quedan el curso abierto,
 * las llamadas a la API y la regla que gobierna todo lo demás: **un curso publicado no se
 * edita**. Hay alumnos avanzando por él, y cambiarle los recursos invalidaría su progreso,
 * así que cualquier intento de tocarlo pasa antes por `ifEditable`.
 *
 * El aviso de «lo está editando otra persona» es cooperativo: informa, no bloquea datos.
 */
export default function CourseBuilderPage() {
  // `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página.
  return (
    <Suspense fallback={<PageLoader message="Cargando cursos..." />}>
      <CourseBuilder />
    </Suspense>
  );
}

function CourseBuilder() {
  const { role, user } = useSession();
  const { showAlert, showConfirmation } = useAlerts();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [selection, setSelection] = useState<Selection>(NONE);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [uploadingCover, setUploadingCover] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(false);

  // Avisos: qué hacer tras pasar el curso a borrador, y la salida de un borrador pendiente de
  // confirmar, con el enlace que se pulsó (`null`: el botón de volver).
  const [pendingDraftAction, setPendingDraftAction] = useState<(() => void) | null>(null);
  const [pendingExit, setPendingExit] = useState<{ to: string | null } | null>(null);

  const isAdmin = role === 'admin';
  const readOnly = activeCourse?.status === 'PUBLISHED';
  const otherEditor = useCourseLock(activeCourse?.guid);

  // ── Datos ────────────────────────────────────────────────────────────────

  const saveChange = useCallback(
    async (onFailure: string, action: () => Promise<void>): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (error) {
        showAlert.error('Error', errorMessage(error, onFailure));
        return false;
      }
    },
    [showAlert],
  );

  const syncToCatalog = useCallback((guid: string, changes: Partial<Course>) => {
    setCourses((prev) => prev.map((c) => (c.guid === guid ? { ...c, ...changes } : c)));
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      const { data } = await api.get<Course[]>('/courses');
      setCourses(data);
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudieron cargar los cursos.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  const reloadActiveCourse = useCallback(async () => {
    if (!activeCourse) return;
    await saveChange('No se pudo refrescar el curso.', async () => {
      const { data } = await api.get<Course>(`/courses/${activeCourse.guid}/manage`);
      setActiveCourse(data);
    });
  }, [activeCourse, saveChange]);

  useEffect(() => {
    void loadCourses();
    import('@justinribeiro/lite-youtube').catch(() => undefined);
  }, [loadCourses]);

  // Otro administrador puede crear, borrar o publicar cursos mientras se edita aquí.
  useRealtimeEvent('course:created', () => void loadCourses());
  useRealtimeEvent('course:deleted', () => void loadCourses());
  useRealtimeEvent('course:updated', () => void loadCourses());

  // ── Entrada por URL ──────────────────────────────────────────────────────

  /** Abre el curso —y, si viene indicado, el recurso— que trae la dirección. */
  useEffect(() => {
    const courseParam = searchParams?.get('course');

    if (!courseParam) {
      // Un examinador llega siempre desde su tablero con el curso en la URL.
      if (role === 'teacher' && !activeCourse) router.replace('/dashboard');
      // Sin curso en la dirección no hay curso abierto: es lo que espera quien pulsa Atrás.
      setActiveCourse(null);
      setSelection(NONE);
      setExpandedModules({});
      return;
    }

    const moduleGuid = searchParams?.get('module');
    const resourceGuid = searchParams?.get('resource');
    // Abrir o crear un curso desde esta pantalla ya lo deja cargado: la dirección sólo lo refleja.
    if (activeCourse?.guid === courseParam && !resourceGuid) return;

    // Yendo y viniendo deprisa con Atrás, sólo cuenta la respuesta del curso que pide la dirección.
    let current = true;
    api
      .get<Course>(`/courses/${courseParam}`)
      .then(({ data }) => {
        if (!current) return;
        setActiveCourse(data);
        if (!moduleGuid || !resourceGuid) return;

        const courseModule = data.modules?.find((m) => m.guid === moduleGuid);
        const resource = courseModule?.resources?.find((r) => r.guid === resourceGuid);
        if (!resource) return;

        setSelection({ type: 'RESOURCE', resource, moduleGuid });
        setExpandedModules((prev) => ({ ...prev, [moduleGuid]: true }));
      })
      .catch((error) => {
        if (current) showAlert.error('Error', errorMessage(error, 'No se pudo abrir el curso.'));
      });
    return () => {
      current = false;
    };
    // Sólo cuando cambia la dirección. `activeCourse` se lee para no volver a pedir el curso que
    // ya está abierto; como dependencia, el curso recién cargado se pediría otra vez sin fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, role]);

  // ── Salida ───────────────────────────────────────────────────────────────

  const closeCourse = useCallback(() => {
    if (role === 'teacher') {
      router.push('/dashboard');
      return;
    }
    setActiveCourse(null);
    setSelection(NONE);
    setExpandedModules({});
    router.replace(window.location.pathname);
  }, [role, router]);

  /** Sale del curso hacia el enlace que se pulsó o, sin él, adonde lleva el botón de volver. */
  const leaveTo = (to: string | null) => {
    if (to) router.push(to);
    else closeCourse();
  };

  /** Un curso en borrador no lo ve nadie: conviene recordarlo antes de marcharse. */
  const tryToLeave = () => {
    if (activeCourse?.status === 'DRAFT') {
      setPendingExit({ to: null });
      return;
    }
    closeCourse();
  };

  useLeaveGuard(activeCourse?.status === 'DRAFT', {
    warning: 'El curso sigue en Borrador y los alumnos no lo verán. ¿Salir igualmente?',
    onLeave: (to) => setPendingExit({ to }),
    // Moverse dentro del constructor o descargar un archivo no es salir.
    stays: (to) => to.includes('/dashboard/course-builder') || to.includes('/storage/download/'),
  });

  // ── Permiso de edición ───────────────────────────────────────────────────

  /**
   * Ejecuta `action` sólo si el curso admite cambios. Si está publicado, ofrece pasarlo a
   * borrador y continúa después; así nadie edita a ciegas un curso que los alumnos ven.
   */
  const ifEditable = (action: () => void) => {
    if (activeCourse?.status !== 'PUBLISHED') {
      action();
      return;
    }
    setPendingDraftAction(() => action);
  };

  const revertToDraft = async () => {
    if (!activeCourse) return;
    const proceed = pendingDraftAction;
    setPendingDraftAction(null);

    try {
      await api.patch(`/courses/${activeCourse.guid}`, { status: 'DRAFT' });
      setActiveCourse({ ...activeCourse, status: 'DRAFT' });
      syncToCatalog(activeCourse.guid, { status: 'DRAFT' });
      proceed?.();
    } catch (error) {
      showAlert.warning('No se puede editar este curso', errorMessage(error, 'No se pudo cambiar a Borrador.'));
    }
  };

  // ── Curso ────────────────────────────────────────────────────────────────

  const openCourse = async (course: Course) => {
    setLoading(true);
    await saveChange('No se pudo abrir el curso.', async () => {
      const { data } = await api.get<Course>(`/courses/${course.guid}`);
      setActiveCourse(data);
      setSelection(NONE);
      setExpandedModules({});
      router.push(`?course=${course.guid}`);
    });
    setLoading(false);
  };

  /** Alta en curso: un doble clic no debe crear dos cursos ni dos módulos. */
  const creating = useRef(false);

  const createCourse = async () => {
    if (creating.current) return;
    creating.current = true;
    await saveChange('No se pudo crear el curso.', async () => {
      const { data: created } = await api.post<Course>('/courses', {
        title: 'Curso nuevo',
        teacherGuid: user?.guid,
      });

      // Recién creado no tiene módulos: se abre tal cual, sin volver a pedirlo.
      setActiveCourse({ ...created, modules: [] });
      setCourses((prev) => [created, ...prev]);
      setSelection(NONE);
      setExpandedModules({});
      router.push(`?course=${created.guid}`);
    });
    creating.current = false;
  };

  const changeStatus = async (status: CourseStatus) => {
    if (!activeCourse) return;
    try {
      await api.patch(`/courses/${activeCourse.guid}`, { status });
      setActiveCourse({ ...activeCourse, status });
      syncToCatalog(activeCourse.guid, { status });
    } catch (error) {
      showAlert.warning('No se puede cambiar el estado', errorMessage(error, 'No se pudo cambiar el estado.'));
    }
  };

  const deleteCourse = async () => {
    if (!activeCourse || readOnly) return;

    const modules = activeCourse.modules ?? [];
    const resources = modules.reduce((total, courseModule) => total + (courseModule.resources?.length ?? 0), 0);
    // Quiénes perderían el acceso; si no se puede saber, el aviso va sin la cifra.
    const enrolled = await api
      .get<{ total?: number }>(`/enrollments/${activeCourse.guid}`)
      .then(({ data }) => data.total ?? 0)
      .catch(() => null);
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

    const confirmed = await showConfirmation(
      'Eliminar curso',
      `Se borrarán de forma permanente su contenido (${count(modules.length, 'módulo', 'módulos')} y ` +
        `${count(resources, 'recurso', 'recursos')}), las matrículas —también las dadas de baja—, el avance de los ` +
        'estudiantes y sus entregas con los archivos, también las de vueltas anteriores.' +
        (enrolled === 1 ? ' Ahora hay 1 estudiante matriculado, que perderá el acceso.' : '') +
        (enrolled && enrolled > 1 ? ` Ahora hay ${enrolled} estudiantes matriculados, que perderán el acceso.` : '') +
        ' Los certificados ya emitidos se conservan y se pueden seguir verificando. No se puede deshacer.',
    );
    if (!confirmed) return;

    const deleted = activeCourse.guid;
    await saveChange('No se pudo eliminar el curso.', async () => {
      await api.delete(`/courses/${deleted}`);
      setCourses((prev) => prev.filter((c) => c.guid !== deleted));
      setActiveCourse(null);
      setSelection(NONE);
      setExpandedModules({});
      window.history.replaceState({}, '', window.location.pathname);
    });
  };

  /** Guarda uno o varios campos de la ficha del curso. */
  const updateCourse = async (changes: Partial<Course>) => {
    if (!activeCourse || readOnly) return;

    // Nada que enviar si el valor no cambió: evita una petición por cada `blur`.
    const effectiveChanges = Object.entries(changes).filter(
      ([field, value]) => activeCourse[field as keyof Course] !== value,
    );
    if (effectiveChanges.length === 0) return;

    const applied = Object.fromEntries(effectiveChanges) as Partial<Course>;
    await saveChange('No se pudo actualizar el curso.', async () => {
      await api.patch(`/courses/${activeCourse.guid}`, applied);
      setActiveCourse({ ...activeCourse, ...applied });
      syncToCatalog(activeCourse.guid, applied);
    });
  };

  const uploadCover = (file: File) =>
    ifEditable(async () => {
      if (!activeCourse) return;
      setUploadingCover(true);
      await saveChange('No se pudo subir la portada.', async () => {
        const { filename } = await uploadFile('/storage/upload?folder=portadas', file, {
          limit: uploadLimit('portadas'),
        });
        await api.patch(`/courses/${activeCourse.guid}`, { coverImage: filename });
        setActiveCourse((prev) => (prev ? { ...prev, coverImage: filename } : prev));
        syncToCatalog(activeCourse.guid, { coverImage: filename });
      });
      setUploadingCover(false);
    });

  const removeCover = () =>
    ifEditable(async () => {
      if (!activeCourse) return;
      await saveChange('No se pudo eliminar la portada.', async () => {
        await api.patch(`/courses/${activeCourse.guid}`, { coverImage: null });
        setActiveCourse((prev) => (prev ? { ...prev, coverImage: null } : prev));
        syncToCatalog(activeCourse.guid, { coverImage: null });
      });
    });

  const publishAndExit = async () => {
    if (!activeCourse || !pendingExit) return;
    const guid = activeCourse.guid;
    const { to } = pendingExit;

    // Se cierra antes de la petición: si llega un evento de tiempo real mientras tanto, no
    // debe reabrir el curso que se está abandonando.
    setPendingExit(null);
    setActiveCourse(null);
    setSelection(NONE);
    setExpandedModules({});

    try {
      await api.patch(`/courses/${guid}`, { status: 'PUBLISHED' });
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudo publicar el curso.'));
    }
    void loadCourses();
    leaveTo(to);
  };

  // ── Módulos y bloques ────────────────────────────────────────────────────

  const createModule = async () => {
    if (!activeCourse || creating.current) return;
    creating.current = true;
    await saveChange('No se pudo crear el módulo.', async () => {
      await api.post(`/courses/${activeCourse.guid}/modules`, {
        title: `Módulo ${(activeCourse.modules?.length ?? 0) + 1} Nuevo`,
      });
      await reloadActiveCourse();
    });
    creating.current = false;
  };

  const renameModule = async (moduleGuid: string, title: string) => {
    // Nada que enviar si el nombre no cambió: evita una petición, y recargar el curso entero,
    // cada vez que el campo pierde el foco.
    const currentTitle = activeCourse?.modules?.find((m) => m.guid === moduleGuid)?.title;
    if (readOnly || title === currentTitle) return;
    await saveChange('No se pudo renombrar el módulo.', async () => {
      await api.patch(`/courses/modules/${moduleGuid}`, { title });
      await reloadActiveCourse();
    });
  };

  const deleteModule = async (courseModule: CourseModule) => {
    const confirmed = await showConfirmation(
      'Eliminar módulo',
      `¿Eliminar el módulo "${courseModule.title}"? Todo su contenido será borrado permanentemente.`,
    );
    if (!confirmed) return;

    await saveChange('No se pudo eliminar el módulo.', async () => {
      await api.delete(`/courses/modules/${courseModule.guid}`);
      setActiveCourse((prev) =>
        prev ? { ...prev, modules: prev.modules?.filter((m) => m.guid !== courseModule.guid) } : prev,
      );
      setSelection((prev) => (prev.type === 'MODULE' && prev.module.guid === courseModule.guid ? NONE : prev));
    });
  };

  const createResource = (moduleGuid: string, type: ResourceKind) =>
    ifEditable(async () => {
      if (!activeCourse) return;
      await saveChange('No se pudo crear el recurso.', async () => {
        const { data } = await api.post<Resource>(`/courses/modules/${moduleGuid}/resources`, {
          ...newResource(type),
          contentHtml: '',
        });
        router.push(`/dashboard/course-builder/${activeCourse.guid}/modules/${moduleGuid}/resources/${data.guid}`);
      });
    });

  const deleteResource = (resourceGuid: string) =>
    ifEditable(async () => {
      const confirmed = await showConfirmation(
        'Eliminar recurso',
        '¿Estás seguro de que deseas eliminar este recurso? Esta acción no se puede deshacer.',
      );
      if (!confirmed) return;

      await saveChange('No se pudo eliminar el recurso.', async () => {
        await api.delete(`/courses/resources/${resourceGuid}`);
        setActiveCourse((prev) =>
          prev
            ? {
                ...prev,
                modules: prev.modules?.map((m) => ({
                  ...m,
                  resources: m.resources?.filter((r) => r.guid !== resourceGuid),
                })),
              }
            : prev,
        );
        setSelection(NONE);
      });
    });

  /** Reordena en pantalla primero y confirma después; si la API falla, se recarga el orden real. */
  const reorderResources = async (moduleGuid: string, from: number, to: number) => {
    if (readOnly || from === to || !activeCourse) return;

    const courseModule = activeCourse.modules?.find((m) => m.guid === moduleGuid);
    if (!courseModule?.resources) return;

    const resources = [...courseModule.resources];
    const [moved] = resources.splice(from, 1);
    resources.splice(to, 0, moved);

    setActiveCourse({
      ...activeCourse,
      modules: activeCourse.modules?.map((m) => (m.guid === moduleGuid ? { ...m, resources } : m)),
    });

    try {
      await api.patch(`/courses/modules/${moduleGuid}/resources/order`, { guids: resources.map((r) => r.guid) });
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudo guardar el nuevo orden.'));
      await reloadActiveCourse();
    }
  };

  // ── Selección ────────────────────────────────────────────────────────────

  const selectModule = (courseModule: CourseModule) => {
    setSelection((prev) =>
      prev.type === 'MODULE' && prev.module.guid === courseModule.guid
        ? NONE
        : { type: 'MODULE', module: courseModule },
    );
  };

  const selectResource = (resource: Resource, moduleGuid: string) => {
    setSelection((prev) =>
      prev.type === 'RESOURCE' && prev.resource.guid === resource.guid
        ? NONE
        : { type: 'RESOURCE', resource, moduleGuid },
    );
    // En móvil el temario tapa el editor: al elegir algo, se aparta.
    setOutlineVisible(false);
  };

  // ── Vista ────────────────────────────────────────────────────────────────

  if (role !== 'admin' && role !== 'teacher') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] animate-in fade-in">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
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
            <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Gestión de cursos
          </h1>
          <p className="text-muted-foreground mt-1">Crea los cursos y organízalos en módulos y recursos.</p>
        </header>
      )}

      {courses.length === 0 ? (
        <NoCourses isAdmin={isAdmin} onCreate={createCourse} />
      ) : activeCourse ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          <CourseHeader
            course={activeCourse}
            isAdmin={isAdmin}
            readOnly={readOnly}
            onBack={tryToLeave}
            onChangeStatus={changeStatus}
            onDelete={deleteCourse}
          />

          <div className="flex flex-1 h-[calc(100%-80px)] overflow-hidden">
            <div className="flex-1 bg-muted/10 overflow-y-auto p-4 pb-28 sm:p-8 sm:pb-28 lg:pb-8 relative">
              {selection.type === 'NONE' && (
                <CourseSettings
                  key={activeCourse.guid}
                  course={activeCourse}
                  readOnly={readOnly}
                  uploadingCover={uploadingCover}
                  onSave={updateCourse}
                  onUploadCover={uploadCover}
                  onRemoveCover={removeCover}
                />
              )}

              {selection.type === 'MODULE' && (
                <ModuleSettings
                  key={selection.module.guid}
                  module={selection.module}
                  readOnly={readOnly}
                  onRename={(title) => renameModule(selection.module.guid, title)}
                />
              )}

              {selection.type === 'RESOURCE' && (
                <ResourcePreview
                  resource={selection.resource}
                  readOnly={readOnly}
                  onEdit={() =>
                    router.push(
                      `/dashboard/course-builder/${activeCourse.guid}/modules/${selection.moduleGuid}/resources/${selection.resource.guid}`,
                    )
                  }
                  onDelete={() => deleteResource(selection.resource.guid)}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setOutlineVisible((visible) => !visible)}
              className="lg:hidden fixed bottom-20 right-6 z-30 h-14 w-14 bg-primary text-primary-foreground rounded-full shadow-xl flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
              title="Temario del curso"
            >
              <Layers className="h-6 w-6" />
            </button>

            {outlineVisible && (
              <div
                className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
                onClick={() => setOutlineVisible(false)}
              />
            )}

            <CourseOutline
              course={activeCourse}
              selection={selection}
              expandedModules={expandedModules}
              readOnly={readOnly}
              visible={outlineVisible}
              onClose={() => setOutlineVisible(false)}
              onToggleModule={(guid) => setExpandedModules((prev) => ({ ...prev, [guid]: !prev[guid] }))}
              onSelectModule={selectModule}
              onSelectResource={selectResource}
              onDeleteModule={deleteModule}
              onCreateModule={createModule}
              onNewResource={createResource}
              onReorder={reorderResources}
            />
          </div>
        </div>
      ) : (
        <CourseCatalog courses={courses} onCreate={isAdmin ? createCourse : undefined} onOpen={openCourse} />
      )}

      {pendingDraftAction && (
        <CoursePublishedAlert onCancel={() => setPendingDraftAction(null)} onRevertToDraft={revertToDraft} />
      )}

      {pendingExit && (
        <DraftExitAlert
          onPublishAndExit={publishAndExit}
          onExitWithoutPublishing={() => {
            setPendingExit(null);
            leaveTo(pendingExit.to);
          }}
          onCancel={() => setPendingExit(null)}
        />
      )}

      {otherEditor && activeCourse && (
        <CourseInUseAlert
          courseTitle={activeCourse.title}
          editor={otherEditor}
          exitText={role === 'teacher' ? 'Volver a mis asignaciones' : 'Volver a gestión de cursos'}
          onExit={closeCourse}
        />
      )}
    </div>
  );
}
