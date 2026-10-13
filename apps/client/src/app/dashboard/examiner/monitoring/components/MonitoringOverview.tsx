import { BarChart3, Clock, TrendingUp, Users } from 'lucide-react';
import { BarsByRange, ProgressLine } from '@/components/ui/charts';
import type { MonitoringSummary } from '@/types/models';
import { StatTile } from '../../components/StatTile';
import { ChartPanel } from '../../components/ChartPanel';
import { PROGRESS_BANDS } from './progress-colors';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Props {
  stats: MonitoringSummary;
  /** Título del curso filtrado, o `undefined` con todos. */
  chosenCourse: string | undefined;
}

/** Cifras y gráficas del monitoreo, contadas por el servidor sobre todo el filtro. */
export function MonitoringOverview({ stats, chosenCourse }: Props) {
  const ranges = PROGRESS_BANDS.map((band, i) => ({ name: band.name, fill: band.fill, count: stats.ranges[i] ?? 0 }));
  const logins = WEEKDAYS.map((name, i) => ({ name, count: stats.loginsPerDay[i] ?? 0 }));
  const noData = stats.students === 0 ? 'No hay datos suficientes para graficar.' : undefined;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          tone="primary"
          value={stats.students}
          label={chosenCourse ? 'Estudiantes cursándolo' : 'Estudiantes en curso'}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          tone="green"
          value={stats.withSubmissions}
          label="Estudiantes con entregas"
        />
        <StatTile
          icon={<BarChart3 className="h-4 w-4" />}
          tone="amber"
          value={stats.totalSubmissions}
          label="Total de entregas"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <ChartPanel
          title={`Distribución de progreso ${chosenCourse ? `(${chosenCourse})` : '(Promedio de cursos en curso)'}`}
          icon={<BarChart3 className="h-5 w-5 text-primary" />}
          emptyMessage={noData}
        >
          <BarsByRange ranges={ranges} />
        </ChartPanel>
        <ChartPanel
          title="Último acceso por día de la semana"
          icon={<Clock className="h-5 w-5 text-primary" />}
          emptyMessage={noData}
        >
          <ProgressLine data={logins} dataKey="count" label="Estudiantes" unit=" estudiantes" />
        </ChartPanel>
      </div>
    </>
  );
}
