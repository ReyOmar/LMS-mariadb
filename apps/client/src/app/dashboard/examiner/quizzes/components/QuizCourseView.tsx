'use client';

import { useMemo, useState } from 'react';
import { Award, BookMarked, FileText, PieChart as PieChartIcon, Star, TrendingUp } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { searchQuery } from '@/lib/search';
import { BarsByRange, Donut } from '@/components/ui/charts';
import { StatTile } from '../../components/StatTile';
import { ChartPanel } from '../../components/ChartPanel';
import { CourseViewHeader } from '../../components/CourseViewHeader';
import { SearchAndFilter } from '../../components/SearchAndFilter';
import { PagedListArea } from '../../components/PagedListArea';
import { scoreDistribution } from '../../components/summary-charts';
import { passRate, resultBreakdown, type AttemptFilter, type CourseQuizSummary } from './results';
import { useQuizAttempts } from './useQuizAttempts';
import { useAttemptRelease } from './useAttemptRelease';
import { QuizGroupList } from './QuizGroupList';

// La API filtra por alumno: aprueba quien supera todos los cuestionarios que presentó.
const FILTER_OPTIONS: { value: AttemptFilter; label: string }[] = [
  { value: 'all', label: 'Todos los alumnos' },
  { value: 'passed', label: 'Alumnos con todo aprobado' },
  { value: 'failed', label: 'Alumnos con algún cuestionario sin aprobar' },
];

interface Props {
  course: CourseQuizSummary;
  onBack: () => void;
  /** Liberar un intento cambia las cifras del curso, que cuenta el servidor. */
  onAttemptReleased: () => void;
}

/** Un curso abierto: sus cifras y gráficas encima del historial de intentos de sus alumnos. */
export function QuizCourseView({ course, onBack, onAttemptReleased }: Props) {
  const [search, setSearch] = useState('');
  const appliedSearch = searchQuery(useDebounce(search, 300));
  const [filter, setFilter] = useState<AttemptFilter>('all');

  const attempts = useQuizAttempts(course.courseGuid, filter, appliedSearch);
  const releaseAttempt = useAttemptRelease(attempts.updateItems, () => {
    void attempts.refresh();
    onAttemptReleased();
  });
  const loaded = useMemo(() => attempts.items.flatMap((row) => row.attempts), [attempts.items]);

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <CourseOverview course={course} onBack={onBack} />

      <SearchAndFilter
        search={search}
        onSearch={setSearch}
        searchLabel="Buscar por nombre del estudiante"
        filter={filter}
        onFilter={setFilter}
        filterLabel="Filtrar por resultado"
        options={FILTER_OPTIONS}
      />

      <PagedListArea list={attempts} loadingMessage="Cargando intentos del curso..." loadMoreLabel="Ver más alumnos">
        <QuizGroupList attempts={loaded} threshold={course.threshold} onReleaseAttempt={releaseAttempt} />
      </PagedListArea>
    </div>
  );
}

function CourseOverview({ course, onBack }: Pick<Props, 'course' | 'onBack'>) {
  return (
    <>
      <CourseViewHeader icon={BookMarked} title={course.title} onBack={onBack}>
        <StatTile
          icon={<FileText className="h-4 w-4" />}
          tone="blue"
          value={course.assessed}
          label="Estudiantes evaluados"
        />
        <StatTile
          icon={<Award className="h-4 w-4" />}
          tone="green"
          value={passRate(course)}
          suffix="%"
          label="Tasa de aprobación"
          highlight
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          tone="primary"
          value={course.average}
          label="Promedio de notas"
          highlight
        />
      </CourseViewHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartPanel title="Tasa de aprobación del curso" icon={<PieChartIcon className="h-5 w-5 text-emerald-500" />}>
          <Donut data={resultBreakdown(course.passedCount, course.failed)} />
        </ChartPanel>
        <ChartPanel title="Campana de notas" icon={<TrendingUp className="h-5 w-5 text-primary" />}>
          <BarsByRange
            ranges={scoreDistribution(course)}
            empty="Aún no hay pruebas calificadas."
            icon={<Star className="h-8 w-8 opacity-20" />}
          />
        </ChartPanel>
      </div>
    </>
  );
}
