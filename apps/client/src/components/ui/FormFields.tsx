'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react';

/** Aspecto de los campos de los formularios públicos: acceso, recuperación y solicitudes. */
export const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-input bg-background/60 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

/** Etiqueta, campo y, si hace falta, una indicación debajo. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Nombre y apellido, uno junto al otro cuando la pantalla da para ello.
 * @param idPrefix Distingue sus campos de los de otro formulario de la misma página.
 */
export function NameFields({
  idPrefix,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  required = false,
}: {
  idPrefix: string;
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Nombre" htmlFor={`${idPrefix}-first-name`}>
        <input
          id={`${idPrefix}-first-name`}
          value={firstName}
          onChange={(event) => onFirstNameChange(event.target.value)}
          required={required}
          autoComplete="given-name"
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Apellido" htmlFor={`${idPrefix}-last-name`}>
        <input
          id={`${idPrefix}-last-name`}
          value={lastName}
          onChange={(event) => onLastNameChange(event.target.value)}
          required={required}
          autoComplete="family-name"
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  );
}

/** Campo con un icono delante que dice qué se escribe en él. */
export function IconInput({ icon: Icon, ...input }: InputProps & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
      <input {...input} className={`${INPUT_CLASS} pl-11`} />
    </div>
  );
}

/** Acción que acompaña al envío sin enviar nada: volver, cancelar, cambiar de dato. */
export function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

/** Contraseña con el botón de mostrarla, para comprobar lo escrito antes de enviarlo. */
export function PasswordInput(input: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
      <input {...input} type={visible ? 'text' : 'password'} className={`${INPUT_CLASS} pl-11 pr-11`} />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground transition-colors"
      >
        <Toggle className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
