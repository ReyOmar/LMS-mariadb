'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Home, Lock, Mail, User } from 'lucide-react';
import api from '@/lib/api';
import type { Country } from '@/lib/country';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';
import { Field, IconInput, PasswordInput } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { LoginResponse, OpenedSession, PendingSetup } from '../auth-responses';

interface Props {
  form: RateLimitedForm;
  country: Country;
  /** El correo se conserva al volver de crear la contraseña o de la solicitud de acceso. */
  email: string;
  onEmailChange: (email: string) => void;
  onSetupRequired: (setup: PendingSetup) => void;
  onSignedIn: (session: OpenedSession) => void;
  onRequestAccess: () => void;
}

export function SignInForm({
  form,
  country,
  email,
  onEmailChange,
  onSetupRequired,
  onSignedIn,
  onRequestAccess,
}: Props) {
  const [password, setPassword] = useState('');

  const signIn = (event: FormEvent) => {
    event.preventDefault();
    void form.submit(async () => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password, country });
      if ('requireSetup' in data) onSetupRequired({ email, temporaryPassword: password, message: data.message });
      else onSignedIn(data);
    }, 'No se pudo iniciar sesión.');
  };

  return (
    <>
      <form onSubmit={signIn} className="space-y-5">
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
        <SubmitButton form={form} idle="Entrar" busy="Comprobando…" />
      </form>

      <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
        <Link
          href="/forgot-password"
          className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
        >
          <Lock className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
        </Link>
        <button
          type="button"
          onClick={onRequestAccess}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
        >
          <User className="h-4 w-4" /> Solicitar acceso al campus
        </button>
        <Link
          href="/"
          className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <Home className="h-3.5 w-3.5" /> Volver al inicio
        </Link>
      </div>
    </>
  );
}
