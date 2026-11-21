'use client';

import { ActivityAreas } from '@/components/ui/charts';
import type { CountrySummary } from '@/types/models';

/** Colores de las dos series de la actividad semanal, los mismos en la leyenda y en la gráfica. */
const ACTIVITY_COLORS = {
  resources: 'hsl(207, 80%, 42%)',
  submissions: 'hsl(152, 60%, 40%)',
};

/** Recursos completados y entregas de los últimos siete días. */
export function WeeklyActivityPanel({ days }: { days: CountrySummary['weeklyActivity'] }) {
  // La API devuelve la actividad sin color; la presentación la pone el cliente.
  // `name` es la clave que las gráficas usan para el eje horizontal.
  const data = days.map((day) => ({ name: day.day, resources: day.resources, submissions: day.submissions }));

  return (
    <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-5 animate-fade-slide-in">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Actividad semanal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Recursos completados y entregas (últimos 7 días)</p>
          </div>
          <div className="flex gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLORS.resources }} /> Recursos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLORS.submissions }} /> Entregas
            </span>
          </div>
        </div>
        <div className="h-64">
          <ActivityAreas
            data={data}
            series={[
              { dataKey: 'resources', label: 'Recursos', color: ACTIVITY_COLORS.resources },
              { dataKey: 'submissions', label: 'Entregas', color: ACTIVITY_COLORS.submissions },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
