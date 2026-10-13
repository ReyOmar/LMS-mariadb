'use client';

import { useMemo, useState } from 'react';
import { BookCheck, Check, FileText, PieChart as PieChartIcon, Star, TrendingUp } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { searchQuery } from '@/lib/search';
import { Donut, BarsByRange } from '@/components/ui/charts';
import { StatTile } from '../../components/StatTile';
import { ChartPanel } from '../../components/ChartPanel';
import { CourseViewHeader } from '../../components/CourseViewHeader';
import { SearchAndFilter } from '../../components/SearchAndFilter';
import { PagedListArea } from '../../components/PagedListArea';
import { scoreDistribution } from '../../components/summary-charts';
import {
  filteredTotal,
  groupByModuleAndAssignment,
  statusBreakdown,
  type CourseSummary,
  type SubmissionFilter,
} from './grouping';
import { useSubmissionQueue } from './useSubmissionQueue';
import { useGrading } from './useGrading';
import { SubmissionList } from './SubmissionList';

const FILTER_OPTIONS: { value: SubmissionFilter; label: string }[] = [
  { value: 'all', label: 'Todas las entregas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'graded', label: 'Calificadas' },
];

interface Props {
  course: CourseSummary;
  onBack: () => void;
  /** Una nota cambia las cifras del curso, que cuenta el servidor. */
  onGraded: () => void;
}

/** Un curso abierto: sus cifras, sus gráficas y la cola de entregas por calificar. */
export function GradingCourseView({ course, onBack, onGraded }: Props) {
  const { country } = useCountry();
  const [search, setSearch] = useState('');
  const appliedSearch = searchQuery(useDebounce(search, 300));
  const [filter, setFilter] = useState<SubmissionFilter>('all');

  const submissions = useSubmissionQueue(course.courseGuid, filter, appliedSearch);
  const grading = useGrading(submissions.updateItems, onGraded);
  const modules = useMemo(() => groupByModuleAndAssignment(submissions.items), [submissions.items]);

  const loaded = formatNumber(submissions.items.length, country);
  const loadMoreLabel = appliedSearch
    ? `Ver más (${loaded} cargadas)`
    : `Ver más (${loaded} de ${formatNumber(filteredTotal(course, filter), country)})`;

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <CourseViewHeader icon={BookCheck} title={course.title} onBack={onBack}>
        <StatTile icon={<FileText className="h-4 w-4" />} tone="blue" value={course.total} label="Total de entregas" />
        <StatTile
          icon={<Star className="h-4 w-4" />}
          tone="amber"
          value={course.pending}
          label="Pendientes por calificar"
        />
        <StatTile icon={<Check className="h-4 w-4" />} tone="green" value={course.graded} label="Calificadas" />
      </CourseViewHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartPanel title="Progreso de calificación" icon={<PieChartIcon className="h-5 w-5 text-primary" />}>
          <Donut data={statusBreakdown(course.pending, course.graded)} />
        </ChartPanel>
        <ChartPanel title="Distribución de notas (calificadas)" icon={<TrendingUp className="h-5 w-5 text-primary" />}>
          <BarsByRange ranges={scoreDistribution(course)} icon={<Star className="h-8 w-8 opacity-20" />} />
        </ChartPanel>
      </div>

      <SearchAndFilter
        search={search}
        onSearch={setSearch}
        searchLabel="Buscar por estudiante o tarea"
        filter={filter}
        onFilter={setFilter}
        filterLabel="Filtrar entregas por estado"
        options={FILTER_OPTIONS}
      />

      <PagedListArea list={submissions} loadingMessage="Cargando entregas del curso..." loadMoreLabel={loadMoreLabel}>
        <SubmissionList
          modules={modules}
          grading={grading.openGuid}
          saving={grading.saving}
          onStart={grading.open}
          onCancel={grading.close}
          onSave={grading.save}
        />
      </PagedListArea>
    </div>
  );
}
