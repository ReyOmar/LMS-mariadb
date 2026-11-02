'use client';

import { Mail } from 'lucide-react';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import { AuthCard, BackToSignIn } from '@/components/layout/AuthCard';
import { ForgotPasswordForm } from '@/components/access/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  const form = useRateLimitedForm();

  return (
    <AuthCard
      icon={Mail}
      title="Recuperar contraseña"
      subtitle="Ingresa tu correo electrónico para recibir un enlace de recuperación."
    >
      <ForgotPasswordForm form={form} backToSignIn={<BackToSignIn />} />
    </AuthCard>
  );
}
