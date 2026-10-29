'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useDialog } from '@/hooks/useDialog';
import type { Country } from '@/lib/country';
import { PRIVACY_REFERENCE, asksForConsentOn } from '@/lib/legal';
import { PrivacyNoticeSummary } from './PrivacyNoticeSummary';

/**
 * Colombia exige una autorización previa, expresa e informada (Ley 1581, art. 9); en México
 * basta con poner el aviso a disposición y que la persona no se oponga, así que allí se pide
 * confirmar que se ha leído.
 */
const WORDING: Record<Country, { title: string; request: string; rights: string; accept: string; decline: string }> = {
  COLOMBIA: {
    title: 'Autorización para tratar tus datos',
    request:
      'Para usar el campus necesitamos tu autorización previa, expresa e informada para tratar tus datos conforme a',
    rights:
      'Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar esta autorización cuando quieras, como se explica en',
    accept: 'Autorizo',
    decline: 'No autorizo, cerrar sesión',
  },
  MEXICO: {
    title: 'Aviso de privacidad',
    request: 'Antes de continuar, revisa cómo tratamos tus datos personales en',
    rights:
      'Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición, y revocar tu consentimiento, como se explica en',
    accept: 'He leído y acepto',
    decline: 'No acepto, cerrar sesión',
  },
};

/**
 * Pide aceptar la política de tratamiento de datos a quien entra sin haber aceptado la
 * versión vigente de su sede: cuentas creadas antes de existir la aceptación, cuentas que
 * dio de alta un administrador o una política que ha cambiado. Sin aceptarla no se puede
 * usar el campus —la API tampoco lo deja—, así que en lugar de la pantalla se ve sólo la
 * petición; la alternativa es cerrar la sesión. Las páginas públicas quedan a la vista,
 * empezando por la legal: hay que poder leer lo que se acepta.
 */
export function DataConsentGate({ children }: { children: ReactNode }) {
  const { user, refreshUser, logout } = useSession();
  const pathname = usePathname();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const open = Boolean(user?.consentRequired) && asksForConsentOn(pathname);
  // Obligatoria: sin `onClose`, Escape no la cierra.
  const { dialogProps, titleId } = useDialog({ open });

  if (!open || !user) return <>{children}</>;
  const wording = WORDING[user.country];

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/me/data-consent');
      await refreshUser();
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo registrar la aceptación. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      {...dialogProps}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <h2 id={titleId} className="text-lg font-bold">
            {wording.title}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {wording.request} <strong className="text-foreground">{PRIVACY_REFERENCE[user.country]}</strong>.
        </p>
        <div className="mb-3">
          <PrivacyNoticeSummary country={user.country} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          {wording.rights}{' '}
          <Link href="/legal#data" target="_blank" className="font-semibold text-primary hover:underline">
            tus derechos
          </Link>
          .
        </p>

        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={logout}
            disabled={saving}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {wording.decline}
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={saving}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : wording.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
