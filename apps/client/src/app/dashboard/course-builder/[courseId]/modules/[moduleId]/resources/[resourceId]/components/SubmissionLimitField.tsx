'use client';

import { Settings } from 'lucide-react';
import { formatMb, parseLimitMb } from '@/lib/upload-limits';

interface Props {
  text: string;
  /** Límite general de la sede, que se aplica si se deja vacío. */
  siteLimitMb: number | undefined;
  ceilingMb: number | undefined;
  onChange: (text: string) => void;
}

/** Peso máximo de lo que entrega cada estudiante en una tarea. */
export function SubmissionLimitField({ text, siteLimitMb, ceilingMb, onChange }: Props) {
  const { error } = parseLimitMb(text, ceilingMb);
  // El campo va en MB: «2048 MB (2 GB)» dice qué escribir y cuánto es.
  const ceilingHint = ceilingMb
    ? ` Máximo ${ceilingMb} MB${ceilingMb % 1024 === 0 ? ` (${formatMb(ceilingMb)})` : ''}.`
    : '';

  return (
    <div className="border border-amber-500/30 rounded-xl p-5 bg-amber-500/5 space-y-4">
      <h3 className="font-bold text-sm text-amber-700 dark:text-amber-500 uppercase tracking-wider flex items-center gap-2">
        <Settings className="h-4 w-4" /> Configuración de entrega
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="max-upload-mb" className="text-xs font-bold text-muted-foreground uppercase">
          Peso máximo estudiante (MB):
        </label>
        <input
          id="max-upload-mb"
          type="number"
          inputMode="numeric"
          min={1}
          max={ceilingMb}
          step={1}
          placeholder={siteLimitMb ? String(siteLimitMb) : 'Sede'}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby="max-upload-mb-hint"
          className={`w-28 bg-background border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold ${
            error ? 'border-red-500' : 'border-border'
          }`}
        />
        <span id="max-upload-mb-hint" className="text-xs text-muted-foreground">
          Vacío: se aplica el límite general de la sede
          {siteLimitMb ? ` (${formatMb(siteLimitMb)})` : ''}.{ceilingHint}
        </span>
      </div>
      {error && <p className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
