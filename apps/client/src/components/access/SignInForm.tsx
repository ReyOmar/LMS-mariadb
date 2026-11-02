'use client';

import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import api from '@/lib/api';
import type { Country } from '@/lib/country';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';
import { Field, IconInput, PasswordInput } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { LoginResponse, OpenedSession, PendingSetup } from './auth-responses';

interface Props {
  form: RateLimitedForm;
  country: Country;
  /** El correo se conserva al volver de crear la contraseña o de la solicitud de acceso. */
  email: string;
  onEmailChange: (email: string) => void;
  onSetupRequired: (setup: PendingSetup) => void;
  onSignedIn: (session: OpenedSession) => void;
  /** Ya dentro: se está abriendo el panel. */
  entering: boolean;
}

export function SignInForm({ form, country, email, onEmailChange, onSetupRequired, onSignedIn, entering }: Props) {
  const [password, setPassword] = useState('');

  const signIn = (event: FormEvent) => {
    event.preventDefault();
    // El aviso es el del campus y no el globo del navegador, que sale en su idioma.
    if (!email.trim() || !password) {
      form.showError(email.trim() ? 'Escribe tu contraseña.' : 'Escribe tu correo electrónico.');
      return;
    }
    void form.submit(async () => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password, country });
      if ('requireSetup' in data) onSetupRequired({ email, temporaryPassword: password, message: data.message });
      else onSignedIn(data);
    }, 'No se pudo iniciar sesión.');
  };

  return (
    <form onSubmit={signIn} noValidate className="space-y-5">
      <FormError message={form.error} />
      <Field label="Correo electrónico" htmlFor="email">
        <IconInput
          icon={Mail}
          id="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          required
          autoComplete="email"
          placeholder="nombre@empresa.com"
        />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <PasswordInput
          id="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </Field>
      <SubmitButton form={form} idle="Entrar" busy="Entrando…" pending={entering} />
    </form>
  );
}
