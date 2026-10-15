'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import api from '@/lib/api';
import type { Country } from '@/lib/country';
import { PRIVACY_REFERENCE } from '@/lib/legal';
import { formatCountdown } from '@/lib/submission-gate';
import type { UserRole } from '@/types/models';
import { useCountdown } from '@/hooks/useCountdown';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';
import { Field, IconInput, INPUT_CLASS, SecondaryButton } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PrivacyNoticeSummary } from '@/components/legal/PrivacyNoticeSummary';

type Step = 'email' | 'code' | 'details';

const STEPS: { id: Step; label: string }[] = [
  { id: 'email', label: 'Verificar correo' },
  { id: 'code', label: 'Introducir código' },
  { id: 'details', label: 'Completar solicitud' },
];

const CODE_LENGTH = 6;

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'STUDENT', label: 'Estudiante (recibo formación)' },
  { value: 'TEACHER', label: 'Examinador (imparto y califico)' },
];

interface Props {
  /** Lo dan los tres pasos: la espera de un 429 sigue aunque se cambie de pantalla. */
  form: RateLimitedForm;
  country: Country;
  /** El correo quedó verificado: desde aquí la solicitud es para la sede en que se empezó. */
  onEmailVerified: () => void;
  onCancel: () => void;
  onSubmitted: () => void;
}

/** El correo se verifica primero para que nadie llene la bandeja del administrador con correos ajenos. */
export function AccessRequestForm({ form, country, onEmailVerified, onCancel, onSubmitted }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [acceptsDataPolicy, setAcceptsDataPolicy] = useState(false);
  /** Hasta que el servidor admita otro código para este correo. */
  const resend = useCountdown();

  const sendCode = () => {
    if (!email.includes('@')) {
      form.showError('Escribe un correo electrónico válido.');
      return;
    }
    void form.submit(async () => {
      // Si ya se le envió uno hace poco, el servidor no manda otro: dice cuánto falta para
      // poder pedirlo y se sigue con el que ya está en su bandeja.
      const { data } = await api.post<{ resendInSeconds: number }>('/auth/verify-email', { email, country });
      setStep('code');
      resend.start(data.resendInSeconds);
    }, 'No se pudo enviar el código.');
  };

  const confirmCode = () =>
    form.submit(async () => {
      await api.post('/auth/confirm-email', { email, code });
      setStep('details');
      onEmailVerified();
    }, 'El código no es correcto.');

  const submitRequest = () =>
    form.submit(async () => {
      await api.post('/auth/access-requests', {
        email,
        firstName,
        lastName,
        requestedRole: role,
        country,
        acceptsDataPolicy,
      });
      onSubmitted();
    }, 'No se pudo enviar la solicitud.');

  const changeEmail = () => {
    setStep('email');
    setCode('');
    form.clearError();
  };

  /** Cada paso es un formulario: Intro lo envía igual que el botón principal. */
  const onSubmitStep = (action: () => unknown) => (event: FormEvent) => {
    event.preventDefault();
    void action();
  };

  return (
    <div className="space-y-5">
      <StepProgress current={step} />
      <FormError message={form.error} />

      {step === 'email' && (
        // Sin validación del navegador: el aviso de correo no válido es el de arriba.
        <form onSubmit={onSubmitStep(sendCode)} noValidate className="space-y-4">
          <Field label="Correo electrónico" htmlFor="request-email">
            <IconInput
              icon={Mail}
              id="request-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@empresa.com"
              autoComplete="email"
            />
          </Field>
          <div className="flex gap-2">
            <SecondaryButton onClick={onCancel}>Volver</SecondaryButton>
            <SubmitButton form={form} idle="Enviar código" busy="Enviando…" icon={Send} className="h-12 flex-1" />
          </div>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={onSubmitStep(confirmCode)} className="space-y-4">
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            Enviamos un código de {CODE_LENGTH} dígitos a <strong>{email}</strong>. Revisa también la carpeta de spam.
          </p>
          <Field label="Código de verificación" htmlFor="request-code">
            <input
              id="request-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              placeholder="000000"
              maxLength={CODE_LENGTH}
              autoComplete="one-time-code"
              className={`${INPUT_CLASS} text-center text-2xl font-mono font-bold tracking-[0.5em]`}
            />
          </Field>
          <div className="flex gap-2">
            <SecondaryButton onClick={changeEmail}>Cambiar correo</SecondaryButton>
            <SubmitButton
              form={form}
              idle="Confirmar"
              busy="Comprobando…"
              icon={CheckCircle2}
              disabled={code.length !== CODE_LENGTH}
              className="h-12 flex-1"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {resend.waiting ? (
              `Podrás pedir otro código en ${formatCountdown(resend.secondsLeft)}`
            ) : (
              <button
                type="button"
                onClick={sendCode}
                disabled={form.blocked}
                className="font-bold text-primary hover:underline disabled:opacity-60"
              >
                Reenviar código
              </button>
            )}
          </p>
        </form>
      )}

      {step === 'details' && (
        <form onSubmit={onSubmitStep(submitRequest)} className="space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <strong>{email}</strong> verificado correctamente
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre" htmlFor="request-first-name">
              <input
                id="request-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                autoComplete="given-name"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Apellido" htmlFor="request-last-name">
              <input
                id="request-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                autoComplete="family-name"
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <Field
            label="¿Con qué función participas?"
            htmlFor="request-role"
            hint="Un administrador revisará la solicitud y confirmará tu función antes de darte acceso."
          >
            <select
              id="request-role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className={INPUT_CLASS}
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          {/* El aviso va antes de la casilla: la autorización sólo es informada si se ve al darla. */}
          <PrivacyNoticeSummary country={country} />

          <label
            htmlFor="request-data-policy"
            className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed"
          >
            <input
              id="request-data-policy"
              type="checkbox"
              checked={acceptsDataPolicy}
              onChange={(event) => setAcceptsDataPolicy(event.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span>
              {country === 'COLOMBIA'
                ? 'Autorizo de forma previa, expresa e informada el tratamiento de mis datos personales conforme a '
                : 'He leído '}
              <Link href="/legal#privacy" target="_blank" className="font-semibold text-primary hover:underline">
                {PRIVACY_REFERENCE[country]}
              </Link>{' '}
              y acepto los{' '}
              <Link href="/legal#terms" target="_blank" className="font-semibold text-primary hover:underline">
                términos de uso
              </Link>
              .
            </span>
          </label>

          <div className="flex gap-2 pt-2">
            <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
            <SubmitButton
              form={form}
              idle="Enviar solicitud"
              busy="Enviando…"
              disabled={!firstName.trim() || !lastName.trim() || !acceptsDataPolicy}
              className="h-12 flex-1"
            />
          </div>
        </form>
      )}
    </div>
  );
}

function StepProgress({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              index === currentIndex
                ? 'bg-primary text-primary-foreground scale-110'
                : index < currentIndex
                  ? 'bg-success text-success-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {index < currentIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
          </div>
          {index < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 rounded ${index < currentIndex ? 'bg-success' : 'bg-muted'}`} />
          )}
        </div>
      ))}
      <span className="text-xs text-muted-foreground ml-auto">{STEPS[currentIndex].label}</span>
    </div>
  );
}
