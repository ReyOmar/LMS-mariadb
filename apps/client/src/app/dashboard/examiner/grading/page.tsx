'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookCheck,
  Check,
  ChevronDown,
  FileText,
  PieChart as PieChartIcon,
  Search,
  Star,
  TrendingUp,
} from 'lucide-react';

import api, { errorMessage } from '@/lib/api';
import { MAX_SCORE, MIN_SCORE } from '@/lib/grading';
import { useDebounce } from '@/hooks/useDebounce';
import { useSession } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { PageLoader } from '@/components/ui/PageLoader';
import type { SubmissionToGrade } from '@/types/models';

import {
  groupByModuleAndAssignment,
  mergeFirstPage,
  scoreDistribution,
  statusBreakdown,
  type SubmissionFilter,
  type CourseSummary,
} from './components/grouping';
import { Donut, BarsByRange } from '@/components/ui/charts';
import { Panel, StatCard } from './components/Widgets';
import { SubmissionList } from './components/SubmissionList';
import { CourseSelector } from './components/CourseSelector';

/**
 * Calificación manual de entregas.
 *
 * Dos vistas: elegir curso y corregir dentro de uno. Esta página coordina —carga, estado
 * de la corrección y guardado—; agrupar la página cargada vive en `components/grouping.ts`.
 *
 * Los datos llegan por dos caminos distintos y es deliberado: **las cifras** (contadores,
 * anillo y barras) vienen contadas del servidor sobre el curso entero, y **la lista** viene
 * por páginas, para que con miles de alumnos todo el trabajo pendiente siga siendo alcanzable.
 *
 * Buscar y filtrar también los hace el servidor, por lo mismo: filtrar en el navegador sólo
 * miraría dentro de lo cargado.
 *
 * Los cuestionarios no aparecen aquí: se corrigen solos y tienen su propio panel.
 */
export default function ManualGrading() {
  const { user } = useSession();
  const { showAlert, notify } = useAlerts();

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionToGrade[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const [courseGuid, setCourseGuid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Busca el servidor; se espera a que deje de teclear para no consultar por cada letra.
  const appliedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<SubmissionFilter>('all');

  const [grading, setGrading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Carga ────────────────────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get<CourseSummary[]>('/assessments/examiner/submissions/summary');
      setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudieron cargar los cursos.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (user?.guid) void loadSummary();
  }, [user?.guid, loadSummary]);

  /** Una página de la cola del curso elegido, con el filtro y la búsqueda que haya puestos. */
  const fetchSubmissions = useCallback(
    (from?: string) =>
      api.get<SubmissionsResponse>('/assessments/examiner/submissions', {
        params: {
          course: courseGuid,
          status: filter === 'all' ? undefined : filter,
          search: appliedSearch || undefined,
          cursor: from,
        },
      }),
    [courseGuid, filter, appliedSearch],
  );

  /** Primera página del curso elegido. Se rehace al cambiar la búsqueda o el filtro. */
  useEffect(() => {
    if (!courseGuid) return;
    let current = true;
    setLoadingSubmissions(true);

    fetchSubmissions()
      .then(({ data }) => {
        if (!current) return;
        setSubmissions(data.submissions ?? []);
        setCursor(data.cursor);
      })
      .catch((error) => {
        if (current) showAlert.error('Error', errorMessage(error, 'No se pudieron cargar las entregas.'));
      })
      .finally(() => {
        if (current) setLoadingSubmissions(false);
      });

    // Una respuesta tardía de la búsqueda anterior pisaría la lista recién pedida.
    return () => {
      current = false;
    };
  }, [courseGuid, fetchSubmissions, showAlert]);

  /**
   * Trae la siguiente tanda sin perder lo que ya está en pantalla.
   *
   * Se pide desde la marca de la última entrega recibida, no desde un número de filas: así
   * el coste no crece según se baja, y nada se repite ni se cuela si mientras tanto llega
   * una entrega nueva.
   */
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    try {
      const { data } = await fetchSubmissions(cursor);
      setSubmissions((prev) => [...prev, ...(data.submissions ?? [])]);
      setCursor(data.cursor);
    } catch (error) {
      notify.error('No se pudieron cargar más entregas', errorMessage(error));
    }
  }, [cursor, fetchSubmissions, notify]);

  const reload = useCallback(() => {
    void loadSummary();
    if (!courseGuid) return;
    void fetchSubmissions()
      .then(({ data }) => setSubmissions((loaded) => mergeFirstPage(data.submissions ?? [], loaded)))
      .catch(() => undefined);
  }, [loadSummary, courseGuid, fetchSubmissions]);

  useRealtimeEvent('submission:new', reload);
  useRealtimeEvent('submission:graded', reload);

  // ── Datos derivados ──────────────────────────────────────────────────────

  const course = useMemo(() => courses.find((c) => c.courseGuid === courseGuid), [courses, courseGuid]);
  const modules = useMemo(() => groupByModuleAndAssignment(submissions), [submissions]);
  const ranges = useMemo(() => (course ? scoreDistribution(course) : []), [course]);

  /** Cuántas entregas coinciden con el filtro. Con búsqueda no se sabe sin preguntar. */
  const filteredTotal = !course
    ? 0
    : filter === 'pending'
      ? course.pending
      : filter === 'graded'
        ? course.graded
        : course.total;

  // ── Acciones ─────────────────────────────────────────────────────────────

  const saveScore = async (guid: string, score: number, feedback: string) => {
    if (!Number.isFinite(score) || score < MIN_SCORE || score > MAX_SCORE) {
      showAlert.warning('Calificación no válida', `Escribe un número entre ${MIN_SCORE} y ${MAX_SCORE}.`);
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/assessments/submissions/${guid}/grade`, {
        score: score,
        feedback: feedback.trim() || undefined,
      });

      // La fila se refleja en el momento: recargar la lista entera movería el acordeón bajo
      // el ratón. Las cifras sí se vuelven a pedir, que es donde vive la verdad del curso.
      setSubmissions((prev) =>
        prev.map((e) =>
          e.guid === guid ? { ...e, status: 'GRADED', score: score, feedback: feedback.trim() || null } : e,
        ),
      );
      void loadSummary();
      setGrading(null);
      notify.success('La nota ha sido guardada y el estudiante notificado.');
    } catch (error) {
      showAlert.error('No se pudo guardar la nota', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const backToCourses = () => {
    setCourseGuid(null);
    setSubmissions([]);
    setCursor(null);
    setSearch('');
    setFilter('all');
    setGrading(null);
  };

  // ── Vista ────────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader message="Cargando entregas para calificar..." />;
  }

  if (!courseGuid || !course) {
    return <CourseSelector courses={courses} onPick={setCourseGuid} />;
  }

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <button
        type="button"
        onClick={backToCourses}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a cursos
      </button>

      <header className="mb-8">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <BookCheck className="h-6 w-6 text-primary" />
          {course.title}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            color="blue"
            value={course.total}
            label="Total de entregas"
          />
          <StatCard
            icon={<Star className="h-4 w-4" />}
            color="amber"
            value={course.pending}
            label="Pendientes por calificar"
          />
          <StatCard icon={<Check className="h-4 w-4" />} color="green" value={course.graded} label="Calificadas" />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Panel title="Progreso de calificación" icon={<PieChartIcon className="h-5 w-5 text-primary" />}>
          <Donut data={statusBreakdown(course.pending, course.graded)} />
        </Panel>
        <Panel title="Distribución de notas (calificadas)" icon={<TrendingUp className="h-5 w-5 text-primary" />}>
          <BarsByRange ranges={ranges} icon={<Star className="h-8 w-8 opacity-20" />} />
        </Panel>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por estudiante o tarea..."
            aria-label="Buscar por estudiante o tarea"
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium"
          />
        </div>
        <div className="relative w-full sm:w-[200px]">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as SubmissionFilter)}
            aria-label="Filtrar entregas por estado"
            className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="all">Todas las entregas</option>
            <option value="pending">Pendientes</option>
            <option value="graded">Calificadas</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loadingSubmissions && submissions.length === 0 ? (
        <PageLoader message="Cargando entregas del curso..." />
      ) : (
        <>
          <SubmissionList
            modules={modules}
            grading={grading}
            saving={saving}
            onStart={(submission) => setGrading(submission.guid)}
            onCancel={() => setGrading(null)}
            onSave={saveScore}
          />

          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              className="mt-6 w-full rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-muted transition-colors"
            >
              Ver más ({submissions.length}
              {appliedSearch ? ' cargadas' : ` de ${filteredTotal}`})
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Una página de la cola: las entregas y por dónde sigue la siguiente. */
interface SubmissionsResponse {
  cursor: string | null;
  submissions: SubmissionToGrade[];
}
