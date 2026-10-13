'use client';

import type { ReactNode } from 'react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';

type Tone = 'primary' | 'blue' | 'amber' | 'green';

const ICON_TONE: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  blue: 'bg-blue-500/10 text-blue-500',
  amber: 'bg-amber-500/10 text-amber-500',
  green: 'bg-emerald-500/10 text-emerald-500',
};

const VALUE_TONE: Record<Tone, string> = {
  primary: 'text-primary',
  blue: 'text-blue-700 dark:text-blue-400',
  amber: 'text-amber-700 dark:text-amber-400',
  green: 'text-emerald-700 dark:text-emerald-400',
};

interface Props {
  icon: ReactNode;
  tone: Tone;
  value: number;
  label: string;
  suffix?: string;
  /** Pinta la cifra con el color de la tarjeta, para las que resumen un resultado. */
  highlight?: boolean;
}

/** Cifra de cabecera de las pantallas del examinador, con el formato numérico de la sede. */
export function StatTile({ icon, tone, value, label, suffix = '', highlight = false }: Props) {
  const { country } = useCountry();
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ICON_TONE[tone]}`}>{icon}</div>
        <span className={`text-2xl font-bold ${highlight ? VALUE_TONE[tone] : ''}`}>
          {formatNumber(value, country)}
          {suffix}
        </span>
      </div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}
