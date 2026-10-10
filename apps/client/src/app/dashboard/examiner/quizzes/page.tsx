'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Search,
  FileText,
  Star,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  TrendingUp,
  ChevronDown,
  PieChart as PieChartIcon,
  AlertCircle,
  Award,
  BookMarked,
  History,
  RotateCcw,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import api, { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/country';
import { MAX_SCORE, scoreColor } from '@/lib/grading';
import { Donut, BarsByRange, BarsByThreshold } from '@/components/ui/charts';
import { useAlerts } from '@/contexts/AlertContext';
import { useDebounce } from '@/hooks/useDebounce';
import type { SubmissionToGrade } from '@/types/models';
import {
  groupByModuleAndQuiz,
  globalStats,
  scoreDistribution,
  getAttemptScore,
  resultBreakdown,
  passRate,
  type StudentWithAttempts,
  type AttemptFilter,
  type CourseQuizSummary,
} from './components/results';
import { dateTime } from '@/lib/dates';
import { initials, matchesSearch, plural } from '@/lib/text';
import { useCurrentList } from '@/hooks/useCurrentList';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';

/** Cuántos caracteres del título caben en una etiqueta de la gráfica. */
const MAX_LABEL_LENGTH = 15;

/** Una página de alumnos: sus intentos y por dónde sigue la siguiente. */
interface AttemptsResponse {
  cursor: string | null;
  submissions: SubmissionToGrade[];
}

/**
 * Analítica de los cuestionarios, que se corrigen solos.
 *
 * Los datos llegan por dos caminos y es deliberado: **las cifras** —promedios, tasas de
 * aprobación y las dos gráficas— vienen contadas del servidor sobre el curso entero, y
 * **el historial de intentos** viene por páginas de alumnos, así que las gráficas describen
 * el curso y no sólo lo cargado.
 *
 * La página avanza por alumno, nunca por intento: de cada persona llegan todos los suyos,
 * así que «3 intentos realizados» sigue siendo cierto.
 */
export default function QuizResults() {
  const { notify, showAlert, showConfirmation } = useAlerts();
  const { user } = useSession();
  const { country } = useCountry();
  const [courses, setCourses] = useState<CourseQuizSummary[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionToGrade[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Curso abierto y filtros de la lista
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [search, setSearch] = useState('');
  // Busca el servidor; se espera a que deje de teclear para no consultar por cada letra.
  const appliedSearch = useDebounce(search, 300);
  const [filter, setFilter] = useState<AttemptFilter>('all');

  // Qué módulos, cuestionarios y alumnos están desplegados
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [openQuizzes, setOpenQuizzes] = useState<Record<string, boolean>>({});
  const [openStudents, setOpenStudents] = useState<Record<string, boolean>>({});

  /** Cifras por curso: las cuenta la base sobre la mejor nota de cada alumno. */
  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get<CourseQuizSummary[]>('/assessments/examiner/quizzes/summary');
      setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      notify.error('No se pudieron cargar los resultados', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user?.guid) void loadSummary();
  }, [user?.guid, loadSummary]);

  /** Una página de alumnos del curso elegido, con el filtro y la búsqueda que haya puestos. */
  const fetchAttempts = useCallback(
    (from?: string) =>
      api.get<AttemptsResponse>('/assessments/examiner/quizzes', {
        params: {
          course: openCourse,
          result: filter === 'all' ? undefined : filter,
          search: appliedSearch || undefined,
          cursor: from,
        },
      }),
    [openCourse, filter, appliedSearch],
  );

  const list = useCurrentList();

  useEffect(() => {
    const isCurrent = list.start();
    if (!openCourse) return;
    setLoadingAttempts(true);

    fetchAttempts()
      .then(({ data }) => {
        if (!isCurrent()) return;
        setSubmissions(data.submissions ?? []);
        setCursor(data.cursor);
      })
      .catch((error) => {
        if (isCurrent()) notify.error('No se pudieron cargar los intentos', errorMessage(error));
      })
      .finally(() => {
        if (isCurrent()) setLoadingAttempts(false);
      });
  }, [openCourse, fetchAttempts, notify, list]);

  /**
   * Trae la siguiente tanda de alumnos sin perder lo que ya está en pantalla.
   * Se pide desde la marca del último recibido, no desde un número de filas: el coste no
   * crece según se baja y nadie se repite ni se cuela si entretanto llega otro intento.
   */
  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const isCurrent = list.extend();
    setLoadingMore(true);
    try {
      const { data } = await fetchAttempts(cursor);
      if (!isCurrent()) return;
      setSubmissions((prev) => [...prev, ...(data.submissions ?? [])]);
      setCursor(data.cursor);
    } catch (error) {
      notify.error('No se pudieron cargar más intentos', errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  /** Vuelve a pedir las cifras y la primera página, sin el indicador de carga. */
  const reloadSilently = useCallback(() => {
    void loadSummary();
    if (!openCourse) return;
    // La misma lista vuelta a pedir, no otra: con `start` invalidaría la carga en curso, que
    // ya no apagaría su indicador.
    const isCurrent = list.extend();
    void fetchAttempts()
      .then(({ data }) => {
        if (!isCurrent()) return;
        setSubmissions(data.submissions ?? []);
        setCursor(data.cursor);
      })
      .catch(() => undefined);
  }, [loadSummary, openCourse, fetchAttempts, list]);

  /** Vuelve al directorio sin dejar la lista del curso anterior para el siguiente que se abra. */
  const backToCourses = () => {
    setOpenCourse(null);
    setSubmissions([]);
    setCursor(null);
    setSearch('');
    setFilter('all');
  };

  useRealtimeEvent('submission:graded', reloadSilently);

  /**
   * Libera un intento más a quien agotó los suyos.
   *
   * El servidor lo hace borrando el último intento calificado —no hay un contador aparte—,
   * así que la confirmación dice qué nota se pierde. Es la salida al «contacta con tu
   * examinador» que lee el alumno cuando agota sus intentos.
   */
  const enableAnotherAttempt = async (student: StudentWithAttempts) => {
    const last = student.attempts[0];
    const quiz = last?.assignmentGuid;
    if (!quiz || !student.student) return;

    const score = getAttemptScore(last);
    const confirmed = await showConfirmation(
      `¿Habilitar otro intento a ${student.student.firstName}?`,
      `Para liberarle un intento se borra el último que hizo${score !== null ? ` (nota ${formatNumber(score, country)})` : ''}. ` +
        'Recibirá un aviso para volver a presentarlo.',
      'Habilitar intento',
      'warning',
    );
    if (!confirmed) return;

    try {
      await api.post(`/assessments/quiz/${quiz}/students/${student.student.guid}/new-attempt`);
      notify.success('Intento habilitado', `${student.student.firstName} ya puede volver a presentar el cuestionario.`);
      reloadSilently();
    } catch (error) {
      showAlert.error('No se pudo habilitar el intento', errorMessage(error));
    }
  };

  const chosenCourse = courses.find((c) => c.courseGuid === openCourse);

  const scoreRanges = useMemo(() => (chosenCourse ? scoreDistribution(chosenCourse) : []), [chosenCourse]);

  const selectedCourseBreakdown = resultBreakdown(chosenCourse?.passedCount ?? 0, chosenCourse?.failed ?? 0);

  const groupedSubmissions = useMemo(() => groupByModuleAndQuiz(submissions), [submissions]);

  // Vista 1: directorio de cursos
  if (!openCourse && !loading) {
    if (courses.length === 0) {
      return (
        <div className="animate-in fade-in duration-700">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              Monitoreo de pruebas
            </h1>
            <p className="text-muted-foreground mt-2">
              Supervisa el rendimiento académico de los estudiantes en los cuestionarios.
            </p>
          </header>
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">No hay cursos asignados</h3>
            <p className="text-muted-foreground text-sm mt-1">Actualmente no tienes cursos asignados para analizar.</p>
          </div>
        </div>
      );
    }

    const visibleCourses = courses.filter((c) => matchesSearch(c.title, courseSearch));

    const global = globalStats(courses);
    const globalBreakdown = resultBreakdown(global.passedCount, global.failed);

    const barsByCourse = courses
      .filter((c) => c.assessed > 0)
      .map((c) => ({
        name: c.title.length > MAX_LABEL_LENGTH ? c.title.substring(0, MAX_LABEL_LENGTH) + '...' : c.title,
        average: c.average,
        threshold: c.threshold,
        guid: c.courseGuid,
      }));

    return (
      <div className="animate-in fade-in duration-700">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Monitoreo de pruebas
          </h1>
          <p className="text-muted-foreground mt-2">
            Supervisa el rendimiento académico de los cuestionarios automatizados en tus cursos.
          </p>
        </header>

        {/* Cifras generales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-bold">{global.assessed}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Estudiantes calificados</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{global.rate}%</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Tasa de aprobación global</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/5 to-transparent z-0"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <span className="text-2xl font-bold text-primary">{formatNumber(global.average, country)}</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Promedio global (0-100)</p>
            </div>
          </div>
        </div>

        {/* Gráficas generales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <PieChartIcon className="h-5 w-5 text-emerald-500" />
              Aprobación global
            </h3>
            <div className="h-[200px] w-full">
              <Donut data={globalBreakdown} />
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              Promedio de notas por curso
            </h3>
            <div className="h-[200px] w-full">
              {barsByCourse.length > 0 ? (
                <BarsByThreshold data={barsByCourse} dataKey="average" label="Promedio" />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos suficientes para calcular promedios.
                </div>
              )}
            </div>
          </div>
        </div>

        {courses.length > 0 && (
          <div className="relative max-w-lg mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Buscar curso por nombre..."
              aria-label="Buscar curso por nombre"
              className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
            />
          </div>
        )}

        {visibleCourses.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Sin cursos para mostrar</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No se encontraron cursos que coincidan con la búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleCourses.map((course) => {
              const rate = passRate(course);
              const isExcellent = course.average >= 90;
              const isLow = course.average < course.threshold && course.assessed > 0;

              return (
                <div
                  key={course.courseGuid}
                  className="bg-card border border-border/50 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 rounded-3xl p-6 flex flex-col h-full relative cursor-pointer group"
                  onClick={() => setOpenCourse(course.courseGuid)}
                >
                  <h3 className="font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2 pr-8">
                    {course.title}
                  </h3>

                  <div className="absolute top-6 right-6 p-2 bg-primary/10 text-primary rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  <div className="flex items-center gap-5 mt-auto bg-background/50 p-4 rounded-2xl border border-border/30">
                    <div className="w-16 h-16 shrink-0 rounded-full flex flex-col items-center justify-center border-4 border-background relative">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle cx="50%" cy="50%" r="45%" className="fill-none stroke-muted stroke-[10%]" />
                        <circle
                          cx="50%"
                          cy="50%"
                          r="45%"
                          className={`fill-none stroke-[10%] stroke-linecap-round ${isLow ? 'stroke-red-500' : 'stroke-emerald-500'}`}
                          strokeDasharray="283%"
                          strokeDashoffset={`${283 - (283 * rate) / 100}%`}
                        />
                      </svg>
                      <span className="text-xs font-black relative z-10">{rate}%</span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground uppercase tracking-wider font-bold">Promedio</span>
                        <span
                          className={`font-black text-sm ${isLow ? 'text-red-700 dark:text-red-400' : isExcellent ? 'text-emerald-700 dark:text-emerald-400' : 'text-primary'}`}
                        >
                          {formatNumber(course.average, country)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs mt-1 pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">
                          Aprobados:{' '}
                          <strong className="text-emerald-700 dark:text-emerald-400">{course.passedCount}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Reprobados: <strong className="text-red-700 dark:text-red-400">{course.failed}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Vista de un curso concreto ─────────────────────────────────────────
  if (loading) {
    return <PageLoader message="Cargando analíticas del curso..." />;
  }

  // El curso puede haber desaparecido entre que se eligió y se recargaron los datos.
  if (!chosenCourse) {
    return <PageLoader message="Cargando analíticas del curso..." />;
  }

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <button
        type="button"
        onClick={backToCourses}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a los cursos
      </button>

      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3 mb-6">
          <BookMarked className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          {chosenCourse.title}
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-bold">{chosenCourse.assessed}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Estudiantes evaluados</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Award className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {passRate(chosenCourse)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Tasa de aprobación</p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <span className="text-2xl font-bold text-primary">{formatNumber(chosenCourse.average, country)}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Promedio de notas</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
            <PieChartIcon className="h-5 w-5 text-emerald-500" />
            Tasa de aprobación del curso
          </h3>
          <div className="h-[200px] w-full">
            <Donut data={selectedCourseBreakdown} />
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-primary" />
            Campana de notas
          </h3>
          <div className="h-[200px] w-full">
            <BarsByRange
              ranges={scoreRanges}
              empty="Aún no hay pruebas calificadas."
              icon={<Star className="h-8 w-8 opacity-20" />}
            />
          </div>
        </div>
      </div>

      {/* Fila de búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por estudiante o cuestionario..."
            aria-label="Buscar por estudiante o cuestionario"
            className="w-full bg-card border border-border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
          />
        </div>
        <div className="relative w-full sm:w-[220px]">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AttemptFilter)}
            aria-label="Filtrar por resultado"
            className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="all">Todas las notas</option>
            <option value="passed">Solo aprobados</option>
            <option value="failed">Solo no aprobados</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loadingAttempts && submissions.length === 0 ? (
        <PageLoader message="Cargando intentos del curso..." />
      ) : groupedSubmissions.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-16 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin resultados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            No se encontraron cuestionarios que coincidan con los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSubmissions.map((module) => {
            const isModuleOpen = !!openModules[module.key];

            return (
              <div key={module.key} className="animate-in slide-in-from-bottom-2 duration-300">
                <div
                  className={`bg-primary/5 p-4 border border-primary/20 flex items-center gap-4 cursor-pointer select-none transition-colors hover:bg-primary/10 ${!isModuleOpen ? 'rounded-2xl' : 'rounded-t-2xl'}`}
                  onClick={() => setOpenModules((prev) => ({ ...prev, [module.key]: !prev[module.key] }))}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookMarked className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{module.moduleTitle}</h2>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Promedio del módulo:{' '}
                      <strong className="text-primary">{formatNumber(module.average, country)}</strong>
                    </p>
                  </div>

                  <div className="p-2 bg-background/50 rounded-full shrink-0">
                    <ChevronDown
                      className={`h-5 w-5 text-primary transition-transform duration-300 ${isModuleOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {isModuleOpen && (
                  <div className="border border-t-0 border-border rounded-b-2xl p-4 sm:p-6 bg-card space-y-6">
                    {module.assignments.map((group) => {
                      const quizKey = `${module.key}-${group.key}`;
                      const isQuizOpen = !!openQuizzes[quizKey];

                      return (
                        <div key={group.key} className="space-y-4">
                          <div
                            className="flex items-center gap-3 pb-3 border-b border-border/50 cursor-pointer select-none group"
                            onClick={() =>
                              setOpenQuizzes((prev) => ({
                                ...prev,
                                [quizKey]: !prev[quizKey],
                              }))
                            }
                          >
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                              <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <h3 className="text-base font-bold text-foreground flex-1 truncate group-hover:text-primary transition-colors">
                              {group.assignmentTitle}
                            </h3>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold bg-muted px-3 py-1 rounded-full text-muted-foreground">
                                Promedio: {formatNumber(group.average, country)}
                              </span>
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isQuizOpen ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </div>

                          {isQuizOpen && (
                            <div className="grid grid-cols-1 gap-4 pl-2 md:pl-4 border-l-2 border-border/50 animate-in slide-in-from-top-1 duration-200 pt-2">
                              {group.students.map((student) => {
                                const score = student.bestScore;
                                const hasPassed = score !== null && score >= chosenCourse.threshold;
                                const hasFailed = score !== null && score < chosenCourse.threshold;
                                const studentKey = `${quizKey}-${student.student?.guid || 'unknown'}`;
                                const studentExpanded = !!openStudents[studentKey];

                                return (
                                  <div
                                    key={studentKey}
                                    className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md ${
                                      hasPassed
                                        ? 'border-emerald-500/30'
                                        : hasFailed
                                          ? 'border-red-500/30'
                                          : 'border-border'
                                    }`}
                                  >
                                    <div
                                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none group/est"
                                      onClick={() =>
                                        setOpenStudents((prev) => ({ ...prev, [studentKey]: !prev[studentKey] }))
                                      }
                                    >
                                      <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <div
                                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-inner ${
                                            hasPassed
                                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                              : hasFailed
                                                ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                                                : 'bg-muted text-muted-foreground'
                                          }`}
                                        >
                                          {initials(student.student?.firstName, student.student?.lastName)}
                                        </div>
                                        <div className="truncate flex-1">
                                          <h4 className="font-bold text-sm text-foreground truncate group-hover/est:text-primary transition-colors">
                                            {student.student?.firstName} {student.student?.lastName}
                                          </h4>
                                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                            <History className="h-3 w-3" /> {student.attemptCount}{' '}
                                            {plural(student.attemptCount, 'intento realizado', 'intentos realizados')}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex items-center gap-4">
                                        {score !== null ? (
                                          <div
                                            className={`px-4 py-2 rounded-xl flex items-center gap-1 ${hasPassed ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
                                          >
                                            <span
                                              className={`text-lg font-black ${scoreColor(score, chosenCourse.threshold)}`}
                                            >
                                              {formatNumber(score, country)}
                                            </span>
                                            <span
                                              className={`text-xs font-bold hidden sm:inline opacity-60 ${scoreColor(score, chosenCourse.threshold)}`}
                                            >
                                              / {MAX_SCORE}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="bg-amber-500/10 px-3 py-1.5 rounded-xl">
                                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                              Procesando
                                            </span>
                                          </div>
                                        )}
                                        <ChevronDown
                                          className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${studentExpanded ? 'rotate-180' : ''}`}
                                        />
                                      </div>
                                    </div>

                                    {/* Historial de intentos */}
                                    {studentExpanded && (
                                      <div className="bg-muted/10 border-t border-border/50 p-4 animate-in slide-in-from-top-2 duration-300">
                                        <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4 px-2">
                                          Historial de intentos
                                        </h5>
                                        <div className="space-y-3 relative ml-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
                                          {student.attempts.map((attempt, idx) => {
                                            const attemptScore = getAttemptScore(attempt);
                                            const passedAttempt =
                                              attemptScore !== null && attemptScore >= chosenCourse.threshold;

                                            return (
                                              <div key={attempt.guid} className="relative flex items-center gap-3 pl-4">
                                                <div className="absolute left-0 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full border-4 border-card bg-background text-muted-foreground shadow-sm z-10 text-[10px] font-bold">
                                                  #{student.attemptCount - idx}
                                                </div>
                                                <div className="flex-1 ml-4 p-3 rounded-xl bg-card border border-border/50 shadow-sm flex items-center justify-between hover:border-primary/30 transition-colors">
                                                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                                    {dateTime(attempt.submittedAt)}
                                                  </span>
                                                  {attemptScore !== null ? (
                                                    <div
                                                      className={`px-2.5 py-1 rounded-md ${passedAttempt ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
                                                    >
                                                      <span
                                                        className={`text-sm font-black ${scoreColor(attemptScore, chosenCourse.threshold)}`}
                                                      >
                                                        {formatNumber(attemptScore, country)}
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                                      ?
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {!hasPassed && (
                                          <div className="mt-4 flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() => enableAnotherAttempt(student)}
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50 hover:text-primary transition-colors"
                                            >
                                              <RotateCcw className="h-3.5 w-3.5" /> Habilitar otro intento
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {cursor && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} className="w-full px-4 py-3 text-sm">
              Ver más alumnos
            </LoadMoreButton>
          )}
        </div>
      )}
    </div>
  );
}
