'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { useSearchParams } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import { AuthCard, AuthDone, BackToSignIn } from '@/components/layout/AuthCard';
import { Field, PasswordInput } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';

const MISMATCH = 'Las contraseñas no coinciden.';

export default function ResetPasswordPage() {
  return (
    <AuthCard icon={Lock} title="Nueva contraseña" subtitle="Crea una nueva contraseña segura para tu cuenta.">
      {/* `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página. */}
      <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />}>
        <NewPasswordForm />
      </Suspense>
    </AuthCard>
  );
}

function NewPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const form = useRateLimitedForm();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  // Si el enlace sigue sirviendo, comprobado al abrir: `undefined` mientras se comprueba.
  const [linkProblem, setLinkProblem] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let current = true;
    api
      .post('/auth/reset-password/check', { token })
      .then(() => current && setLinkProblem(null))
      .catch((error: unknown) => {
        if (!current) return;
        // Sólo un rechazo del enlace lo da por perdido; sin red o con el límite de intentos se
        // deja el formulario, y al enviarlo el servidor lo vuelve a comprobar.
        const rejected = isAxiosError(error) && error.response?.status === 400;
        setLinkProblem(rejected ? errorMessage(error, 'Este enlace no es válido. Solicita uno nuevo.') : null);
      });
    return () => {
      current = false;
    };
  }, [token]);

  if (!token) return <InvalidLink />;
  if (linkProblem === undefined) {
    return (
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" aria-label="Comprobando el enlace" />
    );
  }
  if (linkProblem) return <InvalidLink title="Este enlace ya no sirve" message={linkProblem} />;

  if (done) {
    return (
      <AuthDone title="¡Contraseña restablecida!">
        <p className="text-muted-foreground text-sm">Tu contraseña se actualizó. Ya puedes iniciar sesión con ella.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 mt-6 bg-primary text-primary-foreground font-bold py-3 px-8 rounded-xl hover:bg-primary/90 transition-colors text-sm"
        >
          Ir a iniciar sesión
        </Link>
      </AuthDone>
    );
  }

  const save = (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password) ?? (password === confirmation ? null : MISMATCH);
    if (problem) {
      form.showError(problem);
      return;
    }
    void form.submit(async () => {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    }, 'No se pudo restablecer la contraseña.');
  };

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <FormError message={form.error} />
      <Field label="Nueva contraseña" htmlFor="new-password" hint={PASSWORD_HINT}>
        <PasswordInput
          id="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          disabled={form.submitting}
        />
      </Field>
      <Field label="Confirmar contraseña" htmlFor="confirm-password">
        <PasswordInput
          id="confirm-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Repite la contraseña"
          autoComplete="new-password"
          required
          disabled={form.submitting}
        />
      </Field>
      <SubmitButton
        form={form}
        idle="Restablecer contraseña"
        busy="Actualizando…"
        disabled={!password || !confirmation}
      />
      <div className="text-center">
        <BackToSignIn />
      </div>
    </form>
  );
}

function InvalidLink({
  title = 'Enlace inválido',
  message = 'No se encontró un token de recuperación en la URL.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-red-700 dark:text-red-400 font-bold">{title}</p>
      <p className="text-muted-foreground text-sm mt-2">{message}</p>
      <Link href="/forgot-password" className="inline-flex mt-4 text-primary font-bold text-sm hover:underline">
        Solicitar uno nuevo
      </Link>
    </div>
  );
}
