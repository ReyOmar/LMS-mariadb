import { formatMb } from '@/lib/upload-limits';
import { Field } from './ThemeSection';

const MB_PER_GB = 1024;

function ceilingHint(ceilingMb: number): string {
  if (!ceilingMb) return '';
  const inGb = ceilingMb % MB_PER_GB === 0 ? ` (${formatMb(ceilingMb)})` : '';
  return ` Admite hasta ${ceilingMb} MB${inGb}.`;
}

export function UploadLimitField({
  text,
  ceilingMb,
  error,
  onChange,
}: {
  text: string;
  ceilingMb: number;
  error: string | null;
  onChange: (text: string) => void;
}) {
  return (
    <Field
      label="Peso máximo por archivo (MB)"
      htmlFor="theme-max-file-mb"
      hint={
        'Se aplica a las entregas de las tareas que no tienen un límite propio y al material que suben los ' +
        `docentes. Cada tarea puede fijar el suyo.${ceilingHint(ceilingMb)}`
      }
    >
      <input
        id="theme-max-file-mb"
        type="number"
        inputMode="numeric"
        min={1}
        max={ceilingMb || undefined}
        step={1}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={`w-full sm:w-40 h-11 px-4 rounded-xl border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none ${
          error ? 'border-destructive' : 'border-border'
        }`}
      />
      {error && <p className="text-xs font-medium text-destructive mt-1.5">{error}</p>}
    </Field>
  );
}
