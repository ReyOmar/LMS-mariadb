'use client';

import {
  BarChart3,
  BookCheck,
  Check,
  FileText,
  Image as ImageIcon,
  PieChart as PieChartIcon,
  Star,
} from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { Donut, GroupedBars, COLOR } from '@/components/ui/charts';
import { StatTile } from '../../components/StatTile';
import { ChartPanel } from '../../components/ChartPanel';
import { CourseDirectory, DirectoryCard } from '../../components/CourseDirectory';
import { shortLabel } from '../../components/summary-charts';
import { gradedPercent, statusBreakdown, countryTotals, type CourseSummary } from './grouping';

interface Props {
  courses: CourseSummary[];
  onPick: (guid: string) => void;
}

/** Primera vista de la calificación: dónde se acumula el trabajo antes de entrar en un curso. */
export function CourseSelector({ courses, onPick }: Props) {
  return (
    <CourseDirectory
      icon={BookCheck}
      title="Calificación de entregas"
      description="Selecciona un curso para ver y calificar las entregas de los estudiantes."
      courses={courses}
      noCoursesMessage="Actualmente no tienes cursos asignados para calificar."
      overview={<Overview courses={courses} onPick={onPick} />}
      renderCard={(course) => <CourseCard course={course} onOpen={() => onPick(course.courseGuid)} />}
    />
  );
}

function Overview({ courses, onPick }: Props) {
  const totals = countryTotals(courses);
  const bars = courses
    .filter((course) => course.total > 0)
    .map((course) => ({
      name: shortLabel(course.title),
      guid: course.courseGuid,
      pending: course.pending,
      graded: course.graded,
    }));

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatTile icon={<FileText className="h-4 w-4" />} tone="blue" value={totals.total} label="Total de entregas" />
        <StatTile icon={<Star className="h-4 w-4" />} tone="amber" value={totals.pending} label="Pendientes globales" />
        <StatTile
          icon={<Check className="h-4 w-4" />}
          tone="green"
          value={totals.graded}
          label="Calificadas globales"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartPanel title="Estado global de entregas" icon={<PieChartIcon className="h-5 w-5 text-primary" />}>
          <Donut data={statusBreakdown(totals.pending, totals.graded)} />
        </ChartPanel>
        <ChartPanel title="Cursos con más actividad" icon={<BarChart3 className="h-5 w-5 text-primary" />}>
          <GroupedBars
            data={bars}
            series={[
              { dataKey: 'pending', label: 'Pendientes', color: COLOR.pending },
              { dataKey: 'graded', label: 'Calificadas', color: COLOR.passed },
            ]}
            onPick={onPick}
            empty="No hay entregas en los cursos asignados."
          />
        </ChartPanel>
      </div>
    </>
  );
}

function CourseCard({ course, onOpen }: { course: CourseSummary; onOpen: () => void }) {
  const { country } = useCountry();
  const progress = gradedPercent(course);

  return (
    <DirectoryCard title={course.title} onOpen={onOpen}>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border">
          {course.coverImage ? (
            <img src={fileUrlFor(course.coverImage) ?? ''} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pendientes</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">
              {formatNumber(course.pending, country)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Calificadas</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {formatNumber(course.graded, country)}
            </span>
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
    </DirectoryCard>
  );
}
