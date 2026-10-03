'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import type { Country } from '@/lib/country';
import type { UserRole } from '@/types/models';
import Link from 'next/link';
import { PRIVACY_REFERENCE } from '@/lib/legal';
import { PrivacyNoticeSummary } from '@/components/legal/PrivacyNoticeSummary';

/**
 * Solicitud de acceso en tres pasos: verificar el correo, confirmar el código y completar
 * los datos.
 *
 * La verificación va primero a propósito: sin ella, cualquiera podría llenar la bandeja del
 * administrador con solicitudes a nombre de correos ajenos.
 */

type Step = 'email' | 'code' | 'details';

const STEPS: { id: Step; label: string }[] = [
  { id: 'email', label: 'Verificar correo' },
  { id: 'code', label: 'Introducir código' },
  { id: 'details', label: 'Completar solicitud' },
];

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'STUDENT', label: 'Estudiante (recibo formación)' },
  { value: 'TEACHER', label: 'Examinador (imparto y califico)' },
];

const RESEND_SECONDS = 60;

export function AccessRequestForm({
  country,
  onEmailVerified,
  onCancel,
  onSubmitted,
}: {
  country: Country;
  /** El correo quedó verificado: desde aquí la solicitud es para la sede en que se empezó. */
  onEmailVerified: () => void;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [acceptsDataPolicy, setAcceptsDataPolicy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendCode = async () => {
    if (!email.includes('@')) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.post('/auth/verify-email', { email, country });
      setStep('code');
      setCountdown(RESEND_SECONDS);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo enviar el código.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/confirm-email', { email, code });
      setStep('details');
      onEmailVerified();
    } catch (failure) {
      setError(errorMessage(failure, 'El código no es correcto.'));
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/access-requests', {
        email,
        firstName,
        lastName,
        requestedRole: role,
        country,
        acceptsDataPolicy,
      });
      onSubmitted();
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo enviar la solicitud.'));
    } finally {
      setBusy(false);
    }
  };

  const currentIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="space-y-5">
      {/* Progreso */}
      <div className="flex items-center gap-2">
        {STEPS.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
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

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {step === 'email' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="request-email" className="text-sm font-medium">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
              <input
                id="request-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-input bg-background/60 pl-11 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={onCancel}>Volver</SecondaryButton>
            <PrimaryButton onClick={sendCode} busy={busy} icon={Send}>
              Enviar código
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="space-y-4">
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            Enviamos un código de 6 dígitos a <strong>{email}</strong>. Revisa también la carpeta de spam.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="request-code" className="text-sm font-medium">
              Código de verificación
            </label>
            <input
              id="request-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              className="w-full h-12 rounded-xl border border-input bg-background text-center text-2xl font-mono font-bold tracking-[0.5em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setStep('email');
                setError('');
              }}
            >
              Cambiar correo
            </SecondaryButton>
            <PrimaryButton onClick={confirmCode} busy={busy} disabled={code.length !== 6} icon={CheckCircle2}>
              Confirmar
            </PrimaryButton>
          </div>
          <div className="text-center">
            {countdown > 0 ? (
              <span className="text-xs text-muted-foreground">Podrás pedir otro código en {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="text-xs font-bold text-primary hover:underline disabled:opacity-60"
              >
                Reenviar código
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={submitRequest} className="space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <strong>{email}</strong> verificado correctamente
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="request-first-name" label="Nombre" value={firstName} onChange={setFirstName} />
            <Field id="request-last-name" label="Apellido" value={lastName} onChange={setLastName} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="request-role" className="text-sm font-medium">
              ¿Con qué función participas?
            </label>
            <select
              id="request-role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="h-12 w-full rounded-xl border border-input bg-background/60 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Un administrador revisará la solicitud y confirmará tu función antes de darte acceso.
            </p>
          </div>

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
            <PrimaryButton
              type="submit"
              busy={busy}
              disabled={!firstName.trim() || !lastName.trim() || !acceptsDataPolicy}
            >
              Enviar solicitud
            </PrimaryButton>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="h-12 w-full rounded-xl border border-input bg-background/60 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-4 text-xs font-bold text-muted-foreground rounded-xl border border-border hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  busy,
  disabled,
  icon: Icon,
  type = 'button',
  children,
}: {
  onClick?: () => void;
  busy: boolean;
  disabled?: boolean;
  icon?: typeof Send;
  type?: 'button' | 'submit';
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className="flex-1 h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
