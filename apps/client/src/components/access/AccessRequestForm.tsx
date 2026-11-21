'use client';

import type { FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import type { Country } from '@/lib/country';
import { PRIVACY_REFERENCE } from '@/lib/legal';
import { formatCountdown } from '@/lib/submission-gate';
import type { UserRole } from '@/types/models';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';
import { Field, IconInput, INPUT_CLASS, NameFields, SecondaryButton } from '@/components/ui/FormFields';
import { FormError } from '@/components/ui/FormError';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PrivacyNoticeSummary } from '@/components/legal/PrivacyNoticeSummary';
import { useAccessRequest, type AccessRequestDetails, type AccessRequestStep } from './useAccessRequest';

const STEPS: { id: AccessRequestStep; label: string }[] = [
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

/** Cada paso es un formulario: Intro lo envía igual que el botón principal. */
const submitting = (action: () => unknown) => (event: FormEvent) => {
  event.preventDefault();
  void action();
};

/** El correo se verifica primero para que nadie llene la bandeja del administrador con correos ajenos. */
export function AccessRequestForm({ form, country, onEmailVerified, onCancel, onSubmitted }: Props) {
  const request = useAccessRequest({ form, country, onEmailVerified, onSubmitted });
  const { step } = request;

  return (
    <div className="space-y-5">
      <StepProgress current={step} />
      <FormError message={form.error} />

      {step === 'email' && (
        <EmailStep
          form={form}
          email={request.email}
          onEmail={request.setEmail}
          onSubmit={request.sendCode}
          onCancel={onCancel}
        />
      )}

      {step === 'code' && (
        <CodeStep
          form={form}
          email={request.email}
          code={request.code}
          onCode={request.setCode}
          resend={request.resend}
          onSubmit={request.confirmCode}
          onResend={request.sendCode}
          onChangeEmail={request.changeEmail}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          form={form}
          country={country}
          email={request.email}
          details={request.details}
          onDetails={request.updateDetails}
          onSubmit={request.submitRequest}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function EmailStep({
  form,
  email,
  onEmail,
  onSubmit,
  onCancel,
}: {
  form: RateLimitedForm;
  email: string;
  onEmail: (email: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    // Sin validación del navegador: el aviso de correo no válido es el de arriba.
    <form onSubmit={submitting(onSubmit)} noValidate className="space-y-4">
      <Field label="Correo electrónico" htmlFor="request-email">
        <IconInput
          icon={Mail}
          id="request-email"
          type="email"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          placeholder="nombre@empresa.com"
          autoComplete="email"
        />
      </Field>
      <div className="flex gap-2">
        <SecondaryButton onClick={onCancel}>Volver</SecondaryButton>
        <SubmitButton form={form} idle="Enviar código" busy="Enviando…" icon={Send} className="h-12 flex-1" />
      </div>
    </form>
  );
}

function CodeStep({
  form,
  email,
  code,
  onCode,
  resend,
  onSubmit,
  onResend,
  onChangeEmail,
}: {
  form: RateLimitedForm;
  email: string;
  code: string;
  onCode: (code: string) => void;
  resend: { waiting: boolean; secondsLeft: number };
  onSubmit: () => unknown;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  return (
    <form onSubmit={submitting(onSubmit)} className="space-y-4">
      <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
        Revisa <strong>{email}</strong>: te enviamos un código de {CODE_LENGTH} dígitos o, si ese correo ya tiene cuenta
        o una solicitud en revisión, cómo seguir. Mira también la carpeta de spam.
      </p>
      <Field label="Código de verificación" htmlFor="request-code">
        <input
          id="request-code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(event) => onCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="000000"
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          className={`${INPUT_CLASS} text-center text-2xl font-mono font-bold tracking-[0.5em]`}
        />
      </Field>
      <div className="flex gap-2">
        <SecondaryButton onClick={onChangeEmail}>Cambiar correo</SecondaryButton>
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
            onClick={onResend}
            disabled={form.blocked}
            className="font-bold text-primary hover:underline disabled:opacity-60"
          >
            Reenviar código
          </button>
        )}
      </p>
    </form>
  );
}

function DetailsStep({
  form,
  country,
  email,
  details,
  onDetails,
  onSubmit,
  onCancel,
}: {
  form: RateLimitedForm;
  country: Country;
  email: string;
  details: AccessRequestDetails;
  onDetails: (changes: Partial<AccessRequestDetails>) => void;
  onSubmit: () => unknown;
  onCancel: () => void;
}) {
  const { firstName, lastName, role, acceptsDataPolicy } = details;

  return (
    <form onSubmit={submitting(onSubmit)} className="space-y-4">
      <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          <strong>{email}</strong> verificado correctamente
        </span>
      </p>

      <NameFields
        idPrefix="request"
        firstName={firstName}
        lastName={lastName}
        onFirstNameChange={(value) => onDetails({ firstName: value })}
        onLastNameChange={(value) => onDetails({ lastName: value })}
        required
      />

      <Field
        label="¿Con qué función participas?"
        htmlFor="request-role"
        hint="Un administrador revisará la solicitud y confirmará tu función antes de darte acceso."
      >
        <select
          id="request-role"
          value={role}
          onChange={(event) => onDetails({ role: event.target.value as UserRole })}
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
          onChange={(event) => onDetails({ acceptsDataPolicy: event.target.checked })}
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
  );
}

function StepProgress({ current }: { current: AccessRequestStep }) {
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
      <span className="text-xs text-muted-foreground ml-1">
        Paso {currentIndex + 1} de {STEPS.length}:{' '}
        <span className="font-semibold text-foreground">{STEPS[currentIndex].label}</span>
      </span>
    </div>
  );
}
