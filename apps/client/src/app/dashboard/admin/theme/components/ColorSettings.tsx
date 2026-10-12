'use client';

import { AlertTriangle } from 'lucide-react';
import { MIN_CONTRAST, primaryContrast } from '@/lib/theme';
import { Country, formatNumber } from '@/lib/country';
import { Field } from './ThemeSection';

const PALETTES = [
  { name: 'Corporativo', primary: '#1e3a8a', secondary: '#ea580c', description: 'Azul serio y naranja vibrante' },
  { name: 'Noche elegante', primary: '#8b5cf6', secondary: '#f59e0b', description: 'Violeta profundo y dorado' },
  { name: 'Bosque', primary: '#166534', secondary: '#65a30d', description: 'Verdes naturales' },
  { name: 'Océano', primary: '#0284c7', secondary: '#06b6d4', description: 'Azules claros y cian' },
  { name: 'Elegancia', primary: '#1f2937', secondary: '#d97706', description: 'Gris oscuro y ámbar' },
  { name: 'Coral', primary: '#dc2626', secondary: '#f97316', description: 'Rojo y naranja cálido' },
] as const;

const CONTRAST_USES = [
  { mode: 'light', use: 'button', label: 'el texto de los botones en modo claro' },
  { mode: 'light', use: 'text', label: 'los títulos y enlaces en modo claro' },
  { mode: 'dark', use: 'button', label: 'el texto de los botones en modo oscuro' },
  { mode: 'dark', use: 'text', label: 'los títulos y enlaces en modo oscuro' },
] as const;

interface Colors {
  primaryColor: string;
  secondaryColor: string;
}

export function ColorSettings({
  colors,
  country,
  onChange,
}: {
  colors: Colors;
  country: Country;
  onChange: (colors: Partial<Colors>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ColorPicker
          label="Color primario"
          hint="En modo oscuro se aclara lo necesario para que se lea bien sobre el fondo."
          value={colors.primaryColor}
          onChange={(primaryColor) => onChange({ primaryColor })}
        />
        <ColorPicker
          label="Color secundario"
          value={colors.secondaryColor}
          onChange={(secondaryColor) => onChange({ secondaryColor })}
        />
      </div>

      <ContrastWarning color={colors.primaryColor} country={country} />

      <div>
        <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Combinaciones</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {PALETTES.map((palette) => (
            <button
              key={palette.name}
              type="button"
              onClick={() => onChange({ primaryColor: palette.primary, secondaryColor: palette.secondary })}
              className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/30 transition-all"
            >
              <span className="flex shrink-0">
                <span className="h-8 w-8 rounded-l-lg" style={{ background: palette.primary }} />
                <span className="h-8 w-8 rounded-r-lg" style={{ background: palette.secondary }} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold truncate">{palette.name}</span>
                <span className="block text-xs text-muted-foreground truncate">{palette.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ColorPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-14 w-20 rounded-xl border border-border cursor-pointer bg-transparent"
          aria-label={label}
        />
        <span className="text-sm font-mono">{value}</span>
      </div>
    </Field>
  );
}

/** Se trunca para no enseñar «4,5:1» en un contraste de 4,46 que no llega. */
function contrastRatio(value: number, country: Country): string {
  return `${formatNumber(Math.floor(value * 10) / 10, country)}:1`;
}

function ContrastWarning({ color, country }: { color: string; country: Country }) {
  const contrast = primaryContrast(color);
  if (!contrast) return null;

  const failing = CONTRAST_USES.filter(({ mode, use }) => contrast[mode][use] < MIN_CONTRAST).map(
    ({ mode, use, label }) => `${label} (${contrastRatio(contrast[mode][use], country)})`,
  );
  if (failing.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
      <p>
        Con este color primario cuesta leer {new Intl.ListFormat('es', { type: 'conjunction' }).format(failing)}: no
        llegan al contraste mínimo recomendado de {contrastRatio(MIN_CONTRAST, country)}. Prueba con un tono más oscuro.
      </p>
    </div>
  );
}
