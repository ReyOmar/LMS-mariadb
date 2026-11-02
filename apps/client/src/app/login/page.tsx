'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { fileUrlFor, isLogoutReason, loginUrl, safeNextPath } from '@/lib/api';
import { isCountry } from '@/lib/country';
import { useCountry } from '@/contexts/CountryContext';
import { useConfig } from '@/contexts/ConfigContext';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { AccessPanel } from '@/components/access/AccessPanel';
import LoginLoading from './loading';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const params = useSearchParams();
  const { ready: countryReady, selectCountry } = useCountry();
  const { config } = useConfig();

  /** Página a la que volver tras entrar, como la de un enlace de correo abierto sin sesión. */
  const [next] = useState(() => safeNextPath(params?.get('next')));
  /** Por qué se llegó aquí al cerrarse la sesión: se explica antes de volver a pedir las credenciales. */
  const [logoutReason] = useState(() => {
    const reason = params?.get('reason');
    return isLogoutReason(reason) ? reason : null;
  });

  // La sede del enlace de bienvenida se aplica, y ella y el motivo de la salida se quitan de la
  // URL para que al recargar no vuelva a salir el mismo aviso.
  useEffect(() => {
    if (!countryReady) return;
    const site = params?.get('sede');
    if (!isLogoutReason(params?.get('reason')) && !isCountry(site)) return;

    if (isCountry(site)) selectCountry(site);
    window.history.replaceState({}, '', loginUrl(undefined, next));
  }, [params, countryReady, selectCountry, next]);

  if (!countryReady) return <LoginLoading />;

  return (
    <LoginFrame backgroundUrl={fileUrlFor(config?.loginBackgroundUrl)}>
      <AccessPanel destination={next ?? '/dashboard'} logoutReason={logoutReason} />
    </LoginFrame>
  );
}

/** Fondo de la sede (o los degradados de serie) y la tarjeta centrada del formulario. */
function LoginFrame({ backgroundUrl, children }: { backgroundUrl: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      {backgroundUrl ? (
        <img src={backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] z-0" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary/30 blur-[100px] z-0" />
        </>
      )}
      <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-xl p-6 sm:p-8 relative z-10 backdrop-blur-sm">
        {children}
      </div>
    </div>
  );
}
