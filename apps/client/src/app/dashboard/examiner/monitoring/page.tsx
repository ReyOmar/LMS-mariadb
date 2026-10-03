'use client';

import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Clock, Filter, Search, TrendingUp, Users } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LastAccess } from '@/components/ui/LastAccess';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import api, { errorMessage } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { BarsByRange, COLOR, ProgressLine } from '@/components/ui/charts';
import { useAlerts } from '@/contexts/AlertContext';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import type { MonitoredStudent, MonitoringSummary } from '@/types/models';
import { ProgressBar } from './components/ProgressBar';
import { StudentCourses } from './components/StudentCourses';

const RANGES = [
  { name: '0% - 25%', fill: COLOR.failed },
  { name: '26% - 50%', fill: COLOR.pending },
  { name: '51% - 75%', fill: COLOR.secondary },
  { name: '76% - 100%', fill: COLOR.passed },
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface PagedStudents {
  cursor: string | null;
  students: MonitoredStudent[];
}

/**
 * Monitoreo de los alumnos de los cursos que gestiona quien consulta.
 *
 * Sigue la formación **en curso**: quien ya se certificó en un curso deja de contar en él
 * (sigue matriculado y conserva el acceso, pero no tiene avance que seguir).
 *
 * Las cifras y las gráficas las calcula el servidor sobre todos los alumnos del filtro; la
 * lista llega por páginas. Así, con miles de alumnos, la pantalla abre igual de rápido y
 * las gráficas siguen describiendo a todos y no sólo a los que se han cargado.
 */
export default function StudentMonitoringPage() {
  const { notify } = useAlerts();
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [students, setStudents] = useState<MonitoredStudent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const appliedSearch = useDebounce(search, 300);
  const [course, setCourse] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter = useMemo(
    () => ({ course: course || undefined, search: appliedSearch.trim() || undefined }),
    [course, appliedSearch],
  );
  // Con varias páginas en pantalla, un aviso de tiempo real no debe devolver a la primera.
  const loadedPages = useRef(1);
  // Al cambiar de filtro deprisa, la respuesta de uno anterior no puede pisar a la última.
  const lastRequest = useRef(0);

  const load = useCallback(
    async (withList = true) => {
      const request = ++lastRequest.current;
      try {
        const [stats, page] = await Promise.all([
          api.get<MonitoringSummary>('/dashboards/monitoring/summary', { params: filter }),
          withList ? api.get<PagedStudents>('/dashboards/monitoring', { params: filter }) : null,
        ]);
        if (request !== lastRequest.current) return;
        setSummary(stats.data);
        if (page) {
          setStudents(page.data.students);
          setCursor(page.data.cursor);
          loadedPages.current = 1;
        }
      } catch (error) {
        notify.error('No se pudo cargar el monitoreo', errorMessage(error));
      }
    },
    [filter, notify],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    const request = lastRequest.current;
    setLoadingMore(true);
    try {
      const { data } = await api.get<PagedStudents>('/dashboards/monitoring', { params: { ...filter, cursor } });
      if (request !== lastRequest.current) return;
      setStudents((prev) => [...prev, ...data.students]);
      setCursor(data.cursor);
      loadedPages.current += 1;
    } catch (error) {
      notify.error('No se pudieron cargar más alumnos', errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = () => void load(loadedPages.current === 1);
  useRealtimeEvent('submission:new', refresh);
  useRealtimeEvent('submission:graded', refresh);
  useRealtimeEvent('enrollment:changed', refresh);

  if (!summary) return <PageLoader message="Cargando monitoreo de estudiantes..." />;

  const chosenCourse = summary.courses.find((c) => c.guid === course);
  const ranges = RANGES.map((range, i) => ({ ...range, count: summary.ranges[i] ?? 0 }));
  const logins = WEEKDAYS.map((name, i) => ({ name, count: summary.loginsPerDay[i] ?? 0 }));
  const toggle = (guid: string) => setExpanded((current) => (current === guid ? null : guid));

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Monitoreo de estudiantes
        </h1>
        <p className="text-muted-foreground mt-2">
          Seguimiento del progreso de los estudiantes con cursos en curso. Quien ya obtuvo el certificado de un curso
          deja de aparecer en él.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Stat
          value={summary.students}
          label={chosenCourse ? 'Estudiantes cursándolo' : 'Estudiantes en curso'}
          icon={<Users className="h-5 w-5 text-primary" />}
          background="bg-primary/10"
        />
        <Stat
          value={summary.withSubmissions}
          label="Estudiantes con entregas"
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          background="bg-emerald-500/10"
        />
        <Stat
          value={summary.totalSubmissions}
          label="Total de entregas"
          icon={<BarChart3 className="h-5 w-5 text-amber-500" />}
          background="bg-amber-500/10"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <Chart
          title={`Distribución de progreso ${chosenCourse ? `(${chosenCourse.title})` : '(Promedio de cursos en curso)'}`}
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          empty={summary.students === 0}
        >
          <BarsByRange ranges={ranges} />
        </Chart>
        <Chart
          title="Último acceso por día de la semana"
          icon={<Clock className="h-5 w-5 text-primary" />}
          empty={summary.students === 0}
        >
          <ProgressLine data={logins} dataKey="count" label="Estudiantes" unit=" estudiantes" />
        </Chart>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="relative w-full md:w-[400px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido o correo..."
            aria-label="Buscar por nombre, apellido o correo"
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
          />
        </div>

        <div className="relative w-full md:w-[350px]">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            aria-label="Filtrar por curso"
            className="w-full bg-card border border-border rounded-xl pl-11 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="">Todos los cursos asignados</option>
            {summary.courses.map((c) => (
              <option key={c.guid} value={c.guid}>
                {c.title}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin resultados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {search
              ? 'No se encontraron estudiantes con ese criterio de búsqueda.'
              : 'No hay estudiantes con cursos en curso.'}
          </p>
        </div>
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <div className="lg:hidden space-y-3">
            {students.map((student) => (
              <div key={student.guid} className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                <div
                  onClick={() => toggle(student.guid)}
                  className="p-4 cursor-pointer active:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Chevron open={expanded === student.guid} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    </div>
                    <Submissions total={student.totalSubmissions} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <LastAccess guid={student.guid} date={student.lastAccessAt} />
                    <div className="flex-1 max-w-[160px]">
                      <ProgressBar percent={student.progress} className="" />
                    </div>
                  </div>
                </div>
                {expanded === student.guid && (
                  <div className="border-t border-border/30 px-4 py-4 bg-muted/5 animate-in fade-in duration-200">
                    <StudentCourses student={student} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Escritorio: tabla */}
          <div className="hidden lg:block bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 w-8"></th>
                  <th className="px-6 py-4">Estudiante</th>
                  <th className="px-6 py-4">Correo</th>
                  <th className="px-6 py-4">Última Actividad</th>
                  <th className="px-6 py-4">Entregas</th>
                  <th className="px-6 py-4">Progreso {chosenCourse && 'del Curso'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {students.map((student) => (
                  <Fragment key={student.guid}>
                    <tr
                      onClick={() => toggle(student.guid)}
                      className="hover:bg-muted/10 transition-colors cursor-pointer"
                    >
                      <td className="pl-6 py-4">
                        <Chevron open={expanded === student.guid} />
                      </td>
                      <td className="px-6 py-4 font-bold">
                        {student.firstName} {student.lastName}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{student.email}</td>
                      <td className="px-6 py-4">
                        <LastAccess guid={student.guid} date={student.lastAccessAt} />
                      </td>
                      <td className="px-6 py-4">
                        <Submissions total={student.totalSubmissions} />
                      </td>
                      <td className="px-6 py-4">
                        <ProgressBar percent={student.progress} />
                      </td>
                    </tr>
                    {expanded === student.guid && (
                      <tr className="bg-muted/5 animate-in fade-in duration-200">
                        <td colSpan={6} className="px-10 py-4">
                          <StudentCourses student={student} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {cursor && (
            <div className="p-4 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl border border-border px-5 py-2 text-sm font-bold hover:bg-muted transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Cargando…' : `Ver más (${students.length} de ${summary.students})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  icon,
  background,
}: {
  value: number;
  label: string;
  icon: ReactNode;
  background: string;
}) {
  const { country } = useCountry();
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${background}`}>{icon}</div>
        <span className="text-2xl font-bold">{formatNumber(value, country)}</span>
      </div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function Chart({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-6">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="h-[250px] w-full">
        {empty ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No hay datos suficientes para graficar.
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return open ? (
    <ChevronDown className="h-4 w-4 text-primary shrink-0" />
  ) : (
    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
  );
}

function Submissions({ total }: { total: number }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${total > 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}
    >
      {total}
    </span>
  );
}
