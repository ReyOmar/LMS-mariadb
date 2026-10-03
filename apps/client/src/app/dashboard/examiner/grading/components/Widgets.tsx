'use client';

import type { ReactNode } from 'react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';

/**
 * Tarjetas del panel de calificación.
 *
 * Las gráficas en sí viven en `@/components/ui/charts`, compartidas con el resto del
 * campus para que el mismo «aprobado» tenga el mismo color en todos los paneles.
 */

type StatColor = 'blue' | 'amber' | 'green';

const BACKGROUND: Record<StatColor, string> = {
  blue: 'bg-blue-500/10 text-blue-500',
  amber: 'bg-amber-500/10 text-amber-500',
  green: 'bg-emerald-500/10 text-emerald-500',
};

export function StatCard({
  icon,
  color,
  value,
  label,
}: {
  icon: ReactNode;
  color: StatColor;
  value: number;
  label: string;
}) {
  const { country } = useCountry();
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${BACKGROUND[color]}`}>{icon}</div>
        <span className="text-2xl font-bold">{formatNumber(value, country)}</span>
      </div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

/** Marco de una gráfica: título, icono y alto fijo para que no salte al cargar. */
export function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
        {icon}
        {title}
      </h3>
      <div className="h-[180px] w-full">{children}</div>
    </div>
  );
}
