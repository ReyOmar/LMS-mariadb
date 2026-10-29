'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';
import { Field, PasswordInput, SecondaryButton } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { OpenedSession, PendingSetup } from '../auth-responses';

interface Props {
  form: RateLimitedForm;
  setup: PendingSetup;
  onCancel: () => void;
  onSignedIn: (session: OpenedSession) => void;
  /** Ya dentro: se está abriendo el panel. */
  entering: boolean;
}

/** La cuenta entra por primera vez con la contraseña temporal: elige una propia y entra. */
export function FirstPasswordForm({ form, setup, onCancel, onSignedIn, entering }: Props) {
  const [newPassword, setNewPassword] = useState('');

  const save = (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(newPassword);
    if (problem) {
      form.showError(problem);
      return;
    }
    void form.submit(async () => {
      const { data } = await api.post<OpenedSession>('/auth/set-password', {
        email: setup.email,
        temporaryPassword: setup.temporaryPassword,
        newPassword,
      });
      onSignedIn(data);
    }, 'No se pudo establecer la contraseña.');
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 text-center">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {setup.message}
      </p>
      <FormError message={form.error} />
      <Field label="Tu nueva contraseña" htmlFor="new-password" hint={PASSWORD_HINT}>
        <PasswordInput
          id="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
      </Field>
      <div className="flex gap-2">
        <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
        <SubmitButton
          form={form}
          idle="Guardar y entrar"
          busy="Guardando…"
          pending={entering}
          className="h-12 flex-1"
        />
      </div>
    </form>
  );
}
