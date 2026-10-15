import { Loader2, type LucideIcon } from 'lucide-react';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';

interface Props {
  form: RateLimitedForm;
  idle: string;
  busy: string;
  /** Lo que el formulario exige antes de poder enviarse (campos vacíos, casilla sin marcar…). */
  disabled?: boolean;
  icon?: LucideIcon;
  /** Ancho y alto, que dependen de dónde va el botón. */
  className?: string;
}

/** Botón de enviar de un formulario limitado: espera a su petición y cuenta atrás tras un 429. */
export function SubmitButton({ form, idle, busy, disabled = false, icon: Icon, className = 'h-12 w-full' }: Props) {
  return (
    <button
      type="submit"
      disabled={form.blocked || disabled}
      className={`flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {form.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {form.buttonLabel(idle, busy)}
    </button>
  );
}
