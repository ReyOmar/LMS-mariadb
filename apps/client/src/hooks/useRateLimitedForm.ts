'use client';

import { useCallback, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { SubmissionGate, formatCountdown } from '@/lib/submission-gate';
import { useCountdown } from './useCountdown';

const RATE_LIMITED_NOTICE =
  'Has hecho demasiados intentos seguidos. Podrás volver a intentarlo cuando termine la cuenta atrás.';

/**
 * Formulario público limitado por intentos: con una petición en curso o durante la espera de un 429,
 * `blocked` deshabilita el botón (ver `SubmitButton`) y `submit` no hace nada, ni con doble clic ni con Intro.
 */
export function useRateLimitedForm() {
  const [gate] = useState(() => new SubmissionGate());
  const { secondsLeft, waiting, start: startWait } = useCountdown();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /** `request` lanza si falla; `failureMessage` se enseña cuando el servidor no explica el fallo. */
  const submit = useCallback(
    async (request: () => Promise<void>, failureMessage: string) => {
      if (!gate.isOpen()) return;

      setSubmitting(true);
      setError('');
      const outcome = await gate.pass(request);
      setSubmitting(false);

      if (outcome.status !== 'failed') return;
      if (outcome.retryAfterSeconds > 0) startWait(outcome.retryAfterSeconds);
      else setError(errorMessage(outcome.failure, failureMessage));
    },
    [gate, startWait],
  );

  const clearError = useCallback(() => setError(''), []);

  return {
    submit,
    submitting,
    blocked: submitting || waiting,
    error: waiting ? RATE_LIMITED_NOTICE : error,
    /** Un fallo que el propio formulario detecta antes de enviar. */
    showError: setError,
    clearError,
    buttonLabel: (idle: string, busy: string) =>
      submitting ? busy : waiting ? `Espera ${formatCountdown(secondsLeft)}` : idle,
  };
}

export type RateLimitedForm = ReturnType<typeof useRateLimitedForm>;
