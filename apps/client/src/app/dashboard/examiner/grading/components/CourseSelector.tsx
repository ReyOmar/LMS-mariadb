'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookCheck,
  Check,
  FileText,
  Image as ImageIcon,
  PieChart as PieChartIcon,
  Search,
  Star,
  X,
} from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { matchesSearch } from '@/lib/text';
import { Donut, GroupedBars, COLOR, type GroupedSeries } from '@/components/ui/charts';
import { Panel, StatCard } from './Widgets';
import { gradedPercent, statusBreakdown, countryTotals, type CourseSummary } from './grouping';

/** Cuántos caracteres del título caben en una etiqueta de la gráfica. */
const MAX_LABEL_LENGTH = 15;

interface Props {
  courses: CourseSummary[];
  onPick: (guid: string) => void;
}

/**
 * Primera pantalla: qué curso se va a calificar.
 *
 * Muestra el total de la sede antes de entrar en uno concreto, porque lo primero que
 * necesita saber un examinador con varios cursos es dónde se está acumulando el trabajo.
 */
export function CourseSelector({ courses, onPick }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);

  const totals = useMemo(() => countryTotals(courses), [courses]);

  const visibleItems = useMemo(
    () => courses.filter((c) => matchesSearch(c.title, debouncedSearch)),
    [courses, debouncedSearch],
  );

  const bars: GroupedSeries[] = useMemo(
    () =>
      courses
        .filter((c) => c.total > 0)
        .map((c) => ({
          name: c.title.length > MAX_LABEL_LENGTH ? `${c.title.substring(0, MAX_LABEL_LENGTH)}...` : c.title,
          guid: c.courseGuid,
          pending: c.pending,
          graded: c.graded,
        })),
    [courses],
  );

  if (courses.length === 0) {
    return (
      <div className="animate-in fade-in duration-700">
        <Header />
        <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
          <BookCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">No hay cursos asignados</h3>
          <p className="text-muted-foreground text-sm mt-1">Actualmente no tienes cursos asignados para calificar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700">
      <Header />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard icon={<FileText className="h-4 w-4" />} color="blue" value={totals.total} label="Total de entregas" />
        <StatCard
          icon={<Star className="h-4 w-4" />}
          color="amber"
          value={totals.pending}
          label="Pendientes globales"
        />
        <StatCard
          icon={<Check className="h-4 w-4" />}
          color="green"
          value={totals.graded}
          label="Calificadas globales"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Panel title="Estado global de entregas" icon={<PieChartIcon className="h-5 w-5 text-primary" />}>
          <Donut data={statusBreakdown(totals.pending, totals.graded)} />
        </Panel>
        <Panel title="Cursos con más actividad" icon={<BarChart3 className="h-5 w-5 text-primary" />}>
          <GroupedBars
            data={bars}
            series={[
              { dataKey: 'pending', label: 'Pendientes', color: COLOR.pending },
              { dataKey: 'graded', label: 'Calificadas', color: COLOR.passed },
            ]}
            onPick={onPick}
            empty="No hay entregas en los cursos asignados."
          />
        </Panel>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar curso asignado por nombre..."
            aria-label="Buscar curso asignado por nombre"
            className="w-full bg-card border border-border rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center shadow-sm">
          <BookCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Sin cursos para mostrar</h3>
          <p className="text-muted-foreground text-sm mt-1">No se encontraron cursos que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visibleItems.map((course) => (
            <CourseCard key={course.courseGuid} course={course} onOpen={() => onPick(course.courseGuid)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="mb-6 sm:mb-8">
      <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
        <BookCheck className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
        Calificación de entregas
      </h1>
      <p className="text-muted-foreground mt-2 text-sm sm:text-base">
        Selecciona un curso para ver y calificar las entregas de los estudiantes.
      </p>
    </header>
  );
}

function CourseCard({ course, onOpen }: { course: CourseSummary; onOpen: () => void }) {
  const progress = gradedPercent(course);

  return (
    <div className="bg-card border border-border/50 hover:border-primary/50 hover:shadow-md transition-all rounded-2xl p-6 flex flex-col h-full relative">
      <div className="cursor-pointer group flex-1" onClick={onOpen}>
        <h3 className="font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2 pr-8">
          {course.title}
        </h3>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="absolute top-6 right-6 p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-primary-foreground transition-colors"
        title={`Calificar ${course.title}`}
      >
        <ArrowRight className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-4 mt-auto">
        <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden relative bg-muted flex items-center justify-center border border-border">
          {course.coverImage ? (
            <img
              src={fileUrlFor(course.coverImage) ?? ''}
              alt={`Portada de ${course.title}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          )}
        </div>

        <div className="flex-1 space-y-2 cursor-pointer" onClick={onOpen}>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pendientes</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">{course.pending}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Calificadas</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{course.graded}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-bold text-muted-foreground w-10 text-right">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
