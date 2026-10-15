'use client';

import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import api from '@/lib/api';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import { AuthCard, AuthDone, BackToSignIn } from '@/components/layout/AuthCard';
import { Field, IconInput } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';

export default function ForgotPasswordPage() {
  const form = useRateLimitedForm();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const requestLink = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    void form.submit(async () => {
      await api.post('/auth/forgot-password', { email: address });
      setSentTo(address);
    }, 'No se pudo enviar la solicitud.');
  };

  return (
    <AuthCard
      icon={Mail}
      title="Recuperar contraseña"
      subtitle="Ingresa tu correo electrónico para recibir un enlace de recuperación."
    >
      {sentTo ? (
        <AuthDone title="¡Correo enviado!">
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            Si el correo <strong>{sentTo}</strong> está registrado en el sistema, recibirás un enlace para restablecer
            tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.
          </p>
          <BackToSignIn />
        </AuthDone>
      ) : (
        <form onSubmit={requestLink} className="space-y-5">
          <FormError message={form.error} />
          <Field label="Correo electrónico" htmlFor="email">
            <IconInput
              icon={Mail}
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@correo.com"
              required
              disabled={form.submitting}
            />
          </Field>
          <SubmitButton form={form} idle="Enviar enlace de recuperación" busy="Enviando…" disabled={!email.trim()} />
          <div className="text-center">
            <BackToSignIn />
          </div>
        </form>
      )}
    </AuthCard>
  );
}
