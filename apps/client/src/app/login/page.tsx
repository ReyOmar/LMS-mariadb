'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, GraduationCap, ShieldCheck } from 'lucide-react';
import { fileUrlFor, isLogoutReason, loginUrl, safeNextPath, type LogoutReason } from '@/lib/api';
import { COUNTRY_INFO, isCountry } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { CountrySwitcher } from '@/components/features/CountrySwitcher';
import { useCountry } from '@/contexts/CountryContext';
import { useSession } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import { SessionAlert } from './components/SessionAlert';
import { SignInForm } from './components/SignInForm';
import { FirstPasswordForm } from './components/FirstPasswordForm';
import { AccessRequestForm } from './components/AccessRequestForm';
import type { OpenedSession, PendingSetup } from './auth-responses';
import LoginLoading from './loading';

type View = 'sign-in' | 'first-password' | 'request' | 'request-sent' | 'notice';

const TITLES: Record<View, string> = {
  'sign-in': 'Acceso al campus',
  'first-password': 'Crea tu contraseña',
  request: 'Solicitar acceso',
  'request-sent': 'Solicitud enviada',
  notice: 'Tu sesión terminó',
};

const DESCRIPTIONS: Record<View, string> = {
  'sign-in': 'Introduce tus credenciales para entrar.',
  'first-password': 'Tu cuenta usa todavía la contraseña temporal. Elige una propia para poder continuar.',
  request: 'El registro no es automático: un administrador revisa cada solicitud.',
  'request-sent': 'Ya está en manos de la administración de tu sede.',
  notice: 'Esto es lo que ocurrió.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { country, ready: countryReady, selectCountry } = useCountry();
  const { login } = useSession();
  const { config } = useConfig();

  const [view, setView] = useState<View>('sign-in');
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);
  /** Página a la que volver tras entrar, como la de un enlace de correo abierto sin sesión. */
  const [next] = useState(() => safeNextPath(params?.get('next')));
  const [email, setEmail] = useState('');
  const [pendingSetup, setPendingSetup] = useState<PendingSetup | null>(null);
  /** Con el correo ya verificado, la solicitud queda atada a la sede en la que se empezó. */
  const [requestEmailVerified, setRequestEmailVerified] = useState(false);
  const [enteringCampus, setEnteringCampus] = useState(false);

  // Aquí y no en cada formulario: la espera de un 429 sigue aunque se cambie de pantalla.
  const signIn = useRateLimitedForm();
  const firstPassword = useRateLimitedForm();
  const accessRequest = useRateLimitedForm();

  // El motivo de la salida y la sede del enlace de bienvenida se quitan de la URL para que al
  // recargar no vuelva a salir el mismo aviso.
  useEffect(() => {
    if (!countryReady) return;
    const reason = params?.get('reason');
    const site = params?.get('sede');
    if (!isLogoutReason(reason) && !isCountry(site)) return;

    if (isCountry(site)) selectCountry(site);
    if (isLogoutReason(reason)) {
      setLogoutReason(reason);
      setView('notice');
    }
    window.history.replaceState({}, '', loginUrl(undefined, next));
  }, [params, countryReady, selectCountry, next]);

  const show = (target: View) => {
    signIn.clearError();
    firstPassword.clearError();
    accessRequest.clearError();
    setView(target);
  };

  const backToSignIn = () => {
    setPendingSetup(null);
    setRequestEmailVerified(false);
    show('sign-in');
  };

  const requireSetup = (setup: PendingSetup) => {
    setPendingSetup(setup);
    show('first-password');
  };

  const enterCampus = ({ token, user }: OpenedSession) => {
    login(token, user);
    setEnteringCampus(true);
    router.push(next ?? '/dashboard');
  };

  if (!countryReady) return <LoginLoading />;

  // Ya en el marco del panel: el indicador sigue en el mismo sitio cuando el panel lo releva.
  if (enteringCampus) {
    return (
      <DashboardShell>
        <PageLoader message="Entrando al campus…" />
      </DashboardShell>
    );
  }

  return (
    <LoginFrame backgroundUrl={fileUrlFor(config?.loginBackgroundUrl)}>
      <LoginHeader
        view={view}
        logoUrl={fileUrlFor(config?.logoUrl)}
        // El mensaje de bienvenida lo escribe cada sede desde «Tema y apariencia».
        description={(view === 'sign-in' && config?.welcomeMessage?.trim()) || DESCRIPTIONS[view]}
      />

      {/* Equivocarse de sede es lo más probable y el rechazo no puede decir en cuál está la cuenta;
          con el correo de la solicitud ya verificado, la sede quedó elegida. */}
      {!(view === 'request' && requestEmailVerified) && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <CountryFlag country={country} size="sm" />
          <p className="flex-1 text-xs leading-snug text-muted-foreground">
            {view === 'request' ? 'Solicitas acceso a la sede de ' : 'Entrando en la sede de '}
            <strong className="text-foreground">{COUNTRY_INFO[country].name}</strong>.{' '}
            {view === 'request' ? 'Tu cuenta pertenecerá sólo a ella.' : 'Tu cuenta pertenece a una sola.'}
          </p>
          <CountrySwitcher />
        </div>
      )}

      {view === 'sign-in' && (
        <SignInForm
          form={signIn}
          country={country}
          email={email}
          onEmailChange={setEmail}
          onSetupRequired={requireSetup}
          onSignedIn={enterCampus}
          onRequestAccess={() => show('request')}
        />
      )}

      {view === 'first-password' && pendingSetup && (
        <FirstPasswordForm form={firstPassword} setup={pendingSetup} onCancel={backToSignIn} onSignedIn={enterCampus} />
      )}

      {view === 'request' && (
        <AccessRequestForm
          form={accessRequest}
          country={country}
          onEmailVerified={() => setRequestEmailVerified(true)}
          onCancel={backToSignIn}
          onSubmitted={() => show('request-sent')}
        />
      )}

      {view === 'request-sent' && (
        <div className="flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Un administrador de la sede de {COUNTRY_INFO[country].name} revisará tu solicitud. Recibirás un correo con
            tus datos de acceso en cuanto la apruebe.
          </p>
          <button
            type="button"
            onClick={backToSignIn}
            className="h-11 w-full rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted transition-colors"
          >
            Volver al acceso
          </button>
        </div>
      )}

      {view === 'notice' && logoutReason && <SessionAlert reason={logoutReason} onContinue={backToSignIn} />}
    </LoginFrame>
  );
}

/** Fondo de la sede (o los degradados de serie) y la tarjeta centrada del formulario. */
function LoginFrame({ backgroundUrl, children }: { backgroundUrl: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
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

function LoginHeader({ view, logoUrl, description }: { view: View; logoUrl: string | null; description: string }) {
  // El aviso de sesión y la confirmación de la solicitud traen su propio icono.
  const showIcon = view !== 'notice' && view !== 'request-sent';
  const Icon = view === 'first-password' ? ShieldCheck : GraduationCap;

  return (
    <div className="flex flex-col items-center text-center gap-4 mb-7">
      {logoUrl && view === 'sign-in' ? (
        <img src={logoUrl} alt="" className="max-h-20 max-w-[200px] object-contain" />
      ) : (
        showIcon && (
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <Icon className="h-7 w-7 text-primary" />
          </div>
        )
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{TITLES[view]}</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
