'use client';

import { Award, BarChart3, FileText, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { BarsByThreshold, Donut } from '@/components/ui/charts';
import { StatTile } from '../../components/StatTile';
import { ChartPanel } from '../../components/ChartPanel';
import { CourseDirectory, DirectoryCard } from '../../components/CourseDirectory';
import { shortLabel } from '../../components/summary-charts';
import { globalStats, passRate, resultBreakdown, type CourseQuizSummary } from './results';

/** Promedio a partir del cual un curso se destaca en verde. */
const EXCELLENT_AVERAGE = 90;

interface Props {
  courses: CourseQuizSummary[];
  onPick: (courseGuid: string) => void;
}

/** Primera vista de las pruebas: el rendimiento de todos los cursos y la rejilla para elegir uno. */
export function QuizCourseDirectory({ courses, onPick }: Props) {
  return (
    <CourseDirectory
      icon={BarChart3}
      title="Monitoreo de pruebas"
      description="Supervisa el rendimiento académico de los cuestionarios automatizados en tus cursos."
      courses={courses}
      noCoursesMessage="Actualmente no tienes cursos asignados para analizar."
      overview={<Overview courses={courses} />}
      renderCard={(course) => <QuizCourseCard course={course} onOpen={() => onPick(course.courseGuid)} />}
    />
  );
}

function Overview({ courses }: { courses: CourseQuizSummary[] }) {
  const global = globalStats(courses);
  const averagesByCourse = courses
    .filter((course) => course.assessed > 0)
    .map((course) => ({
      name: shortLabel(course.title),
      average: course.average,
      threshold: course.threshold,
      guid: course.courseGuid,
    }));

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatTile
          icon={<FileText className="h-4 w-4" />}
          tone="blue"
          value={global.assessed}
          label="Estudiantes calificados"
        />
        <StatTile
          icon={<Award className="h-4 w-4" />}
          tone="green"
          value={global.rate}
          suffix="%"
          label="Tasa de aprobación global"
          highlight
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          tone="primary"
          value={global.average}
          label="Promedio global (0-100)"
          highlight
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartPanel title="Aprobación global" icon={<PieChartIcon className="h-5 w-5 text-emerald-500" />}>
          <Donut data={resultBreakdown(global.passedCount, global.failed)} />
        </ChartPanel>
        <ChartPanel title="Promedio de notas por curso" icon={<BarChart3 className="h-5 w-5 text-primary" />}>
          <BarsByThreshold
            data={averagesByCourse}
            dataKey="average"
            label="Promedio"
            empty="No hay datos suficientes para calcular promedios."
          />
        </ChartPanel>
      </div>
    </>
  );
}

function QuizCourseCard({ course, onOpen }: { course: CourseQuizSummary; onOpen: () => void }) {
  const { country } = useCountry();
  const belowThreshold = course.assessed > 0 && course.average < course.threshold;
  const averageTone = belowThreshold
    ? 'text-red-700 dark:text-red-400'
    : course.average >= EXCELLENT_AVERAGE
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-primary';

  return (
    <DirectoryCard title={course.title} onOpen={onOpen}>
      <div className="flex items-center gap-5 bg-background/50 p-4 rounded-2xl border border-border/30">
        <PassRateRing rate={passRate(course)} failing={belowThreshold} />

        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground uppercase tracking-wider font-bold">Promedio</span>
            <span className={`font-black text-sm ${averageTone}`}>{formatNumber(course.average, country)}</span>
          </div>
          <div className="flex justify-between text-xs mt-1 pt-1 border-t border-border/50">
            <span className="text-muted-foreground">
              Aprobados:{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {formatNumber(course.passedCount, country)}
              </strong>
            </span>
            <span className="text-muted-foreground">
              Reprobados:{' '}
              <strong className="text-red-700 dark:text-red-400">{formatNumber(course.failed, country)}</strong>
            </span>
          </div>
        </div>
      </div>
    </DirectoryCard>
  );
}

/** Circunferencia del anillo en el sistema de `strokeDasharray` relativo al tamaño del SVG. */
const RING_LENGTH = 283;

function PassRateRing({ rate, failing }: { rate: number; failing: boolean }) {
  return (
    <div className="w-16 h-16 shrink-0 rounded-full flex flex-col items-center justify-center border-4 border-background relative">
      <svg className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
        <circle cx="50%" cy="50%" r="45%" className="fill-none stroke-muted stroke-[10%]" />
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          className={`fill-none stroke-[10%] stroke-linecap-round ${failing ? 'stroke-red-500' : 'stroke-emerald-500'}`}
          strokeDasharray={`${RING_LENGTH}%`}
          strokeDashoffset={`${RING_LENGTH - (RING_LENGTH * rate) / 100}%`}
        />
      </svg>
      <span className="text-xs font-black relative z-10">{rate}%</span>
    </div>
  );
}
