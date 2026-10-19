'use client';

import { useCallback, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useLiveData } from '@/hooks/useLiveData';
import api from '@/lib/api';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { searchQuery } from '@/lib/search';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MonitoringSummary } from '@/types/models';
import { PageHeading } from '../components/PageHeading';
import { SearchAndFilter } from '../components/SearchAndFilter';
import { PagedListArea } from '../components/PagedListArea';
import { MonitoringOverview } from './components/MonitoringOverview';
import { StudentList } from './components/StudentList';
import { MONITORING_EVENTS, useMonitoredStudents, type MonitoringFilter } from './components/useMonitoredStudents';

const ALL_COURSES = '';

/**
 * Monitoreo de los alumnos de los cursos que gestiona quien consulta. Sigue la formación en
 * curso: quien ya se certificó en un curso deja de contar en él.
 */
export default function StudentMonitoringPage() {
  const { country } = useCountry();
  const [search, setSearch] = useState('');
  const appliedSearch = searchQuery(useDebounce(search, 300));
  const [course, setCourse] = useState(ALL_COURSES);

  const filter = useMemo<MonitoringFilter>(
    () => ({ course: course || undefined, search: appliedSearch || undefined }),
    [course, appliedSearch],
  );
  const fetchSummary = useCallback(async () => {
    const { data } = await api.get<MonitoringSummary>('/dashboards/monitoring/summary', { params: filter });
    return data;
  }, [filter]);
  const summary = useLiveData(fetchSummary, 'No se pudo cargar el monitoreo.', MONITORING_EVENTS);
  const students = useMonitoredStudents(filter);

  const stats = summary.data;
  if (!stats) {
    return summary.error ? (
      <LoadFailed message={summary.error} onRetry={summary.retry} />
    ) : (
      <PageLoader message="Cargando monitoreo de estudiantes..." />
    );
  }

  const chosenCourse = stats.courses.find((candidate) => candidate.guid === course);
  const courseOptions = [
    { value: ALL_COURSES, label: 'Todos los cursos asignados' },
    ...stats.courses.map((candidate) => ({ value: candidate.guid, label: candidate.title })),
  ];

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <PageHeading
        icon={Users}
        title="Monitoreo de estudiantes"
        description="Seguimiento del progreso de los estudiantes con cursos en curso. Quien ya obtuvo el certificado de un curso deja de aparecer en él."
      />

      <MonitoringOverview stats={stats} chosenCourse={chosenCourse?.title} />

      <SearchAndFilter
        search={search}
        onSearch={setSearch}
        searchLabel="Buscar por nombre, apellido o correo"
        filter={course}
        onFilter={setCourse}
        filterLabel="Filtrar por curso"
        options={courseOptions}
      />

      <PagedListArea
        list={students}
        loadingMessage="Cargando estudiantes..."
        loadMoreLabel={`Ver más (${formatNumber(students.items.length, country)} de ${formatNumber(stats.students, country)})`}
      >
        {students.items.length === 0 ? (
          <EmptyState
            className="bg-card border border-dashed border-border rounded-2xl"
            icon={<Users className="h-10 w-10" />}
            title="Sin resultados"
            description={
              appliedSearch
                ? 'No se encontraron estudiantes con ese criterio de búsqueda.'
                : 'No hay estudiantes con cursos en curso.'
            }
          />
        ) : (
          <StudentList students={students.items} courseChosen={Boolean(chosenCourse)} />
        )}
      </PagedListArea>
    </div>
  );
}
