'use client';

import { Clock, KeyRound, Monitor, ShieldAlert, UserCog, type LucideIcon } from 'lucide-react';
import type { LogoutReason } from '@/lib/api';

const NOTICES: Record<LogoutReason, { icon: LucideIcon; title: string; text: string; tone: string }> = {
  expired: {
    icon: Clock,
    title: 'Tu sesión caducó',
    text: 'Por seguridad, cada sesión dura como máximo 24 horas desde que entras. Vuelve a entrar para continuar donde lo dejaste.',
    tone: 'text-primary bg-primary/10 ring-primary/20',
  },
  password: {
    icon: KeyRound,
    title: 'Se cambió tu contraseña',
    text: 'Tu contraseña se cambió. Entra con la nueva; si no fuiste tú, recupérala.',
    tone: 'text-primary bg-primary/10 ring-primary/20',
  },
  role: {
    icon: UserCog,
    title: 'Tu rol cambió',
    text: 'Un administrador cambió tu rol en el campus. Vuelve a entrar para ver las opciones que te corresponden.',
    tone: 'text-primary bg-primary/10 ring-primary/20',
  },
  displaced: {
    icon: Monitor,
    title: 'Se inició sesión en otro dispositivo',
    text: 'Cada cuenta admite una sola sesión activa. Si no has sido tú, cambia tu contraseña en cuanto entres.',
    tone: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 ring-amber-500/20',
  },
  revoked: {
    icon: ShieldAlert,
    title: 'Tu acceso fue retirado',
    text: 'Un administrador cerró tu sesión o dio de baja tu cuenta. Contacta con la administración de tu sede si crees que es un error.',
    tone: 'text-red-600 dark:text-red-400 bg-red-500/10 ring-red-500/20',
  },
};

/** Por qué acabó en el acceso sin pedirlo: sin explicación parecería que algo se rompió. */
export function SessionAlert({ reason, onContinue }: { reason: LogoutReason; onContinue: () => void }) {
  const notice = NOTICES[reason];
  const Icon = notice.icon;

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`h-16 w-16 rounded-3xl flex items-center justify-center mb-6 ring-1 ${notice.tone}`}>
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-bold mb-2">{notice.title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">{notice.text}</p>
      <button
        type="button"
        onClick={onContinue}
        className="h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm transition-colors"
      >
        Iniciar sesión
      </button>
    </div>
  );
}
