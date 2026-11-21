'use client';

import { useState } from 'react';
import api from '@/lib/api';
import type { Country } from '@/lib/country';
import type { UserRole } from '@/types/models';
import { useCountdown } from '@/hooks/useCountdown';
import type { RateLimitedForm } from '@/hooks/useRateLimitedForm';

export type AccessRequestStep = 'email' | 'code' | 'details';

/** Lo que la persona cuenta de sí misma en el último paso. */
export interface AccessRequestDetails {
  firstName: string;
  lastName: string;
  role: UserRole;
  acceptsDataPolicy: boolean;
}

interface Options {
  form: RateLimitedForm;
  country: Country;
  onEmailVerified: () => void;
  onSubmitted: () => void;
}

/** Los tres pasos de la solicitud de acceso: verificar el correo, confirmar el código y completar los datos. */
export function useAccessRequest({ form, country, onEmailVerified, onSubmitted }: Options) {
  const [step, setStep] = useState<AccessRequestStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [details, setDetails] = useState<AccessRequestDetails>({
    firstName: '',
    lastName: '',
    role: 'STUDENT',
    acceptsDataPolicy: false,
  });
  /** Hasta que el servidor admita otro código para este correo. */
  const resend = useCountdown();

  const updateDetails = (changes: Partial<AccessRequestDetails>) =>
    setDetails((current) => ({ ...current, ...changes }));

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
        firstName: details.firstName,
        lastName: details.lastName,
        requestedRole: details.role,
        country,
        acceptsDataPolicy: details.acceptsDataPolicy,
      });
      onSubmitted();
    }, 'No se pudo enviar la solicitud.');

  const changeEmail = () => {
    setStep('email');
    setCode('');
    form.clearError();
  };

  return {
    step,
    email,
    setEmail,
    code,
    setCode,
    details,
    updateDetails,
    resend,
    sendCode,
    confirmCode,
    submitRequest,
    changeEmail,
  };
}
