'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, GraduationCap, Home, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { fileUrlFor, type LogoutReason } from '@/lib/api';
import { COUNTRY_INFO } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { CountrySwitcher } from '@/components/features/CountrySwitcher';
import { BackToSignIn } from '@/components/layout/AuthCard';
import { useCountry } from '@/contexts/CountryContext';
import { useSession } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRateLimitedForm } from '@/hooks/useRateLimitedForm';
import { SessionAlert } from './SessionAlert';
import { SignInForm } from './SignInForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { FirstPasswordForm } from './FirstPasswordForm';
import { AccessRequestForm } from './AccessRequestForm';
import type { OpenedSession, PendingSetup } from './auth-responses';

type View = 'sign-in' | 'forgot-password' | 'first-password' | 'request' | 'request-sent' | 'notice';

const TITLES: Record<View, string> = {
  'sign-in': 'Acceso al campus',
  'forgot-password': 'Recuperar contraseña',
  'first-password': 'Crea tu contraseña',
  request: 'Solicitar acceso',
  'request-sent': 'Solicitud enviada',
  notice: 'Tu sesión terminó',
};

const DESCRIPTIONS: Record<View, string> = {
  'sign-in': 'Introduce tus credenciales para entrar.',
  'forgot-password': 'Te enviaremos un enlace para crear una contraseña nueva.',
  'first-password': 'Tu cuenta usa todavía la contraseña temporal. Elige una propia para poder continuar.',
  request: 'El registro no es automático: un administrador revisa cada solicitud.',
  'request-sent': 'Ya está en manos de la administración de tu sede.',
  notice: 'Esto es lo que ocurrió.',
};

const QUIET_LINK = 'text-xs font-medium text-muted-foreground transition-colors flex items-center gap-1.5';

interface Props {
  /** Adónde lleva al entrar. */
  destination: string;
  /** Por qué terminó la sesión anterior: se explica antes de volver a pedir las credenciales. */
  logoutReason?: LogoutReason | null;
  /** Dentro de una ventana: el id de su título y cómo cerrarla. Sin ella, el panel es la página. */
  dialog?: { titleId: string; onClose: () => void };
}

/**
 * El acceso al campus y sus caminos: entrar, recuperar la contraseña, crear la propia y pedir
 * acceso. Lo usan la página de acceso y la ventana de la portada; cada una pone su marco.
 */
export function AccessPanel({ destination, logoutReason = null, dialog }: Props) {
  const router = useRouter();
  const { country } = useCountry();
  const { login } = useSession();
  const { config } = useConfig();

  const [view, setView] = useState<View>(logoutReason ? 'notice' : 'sign-in');
  const [email, setEmail] = useState('');
  const [pendingSetup, setPendingSetup] = useState<PendingSetup | null>(null);
  /** Con el correo ya verificado, la solicitud queda atada a la sede en la que se empezó. */
  const [requestEmailVerified, setRequestEmailVerified] = useState(false);
  /** Ya dentro, mientras se abre el panel: el formulario sigue ocupado hasta que se ve. */
  const [entering, startEntering] = useTransition();

  // Aquí y no en cada formulario: la espera de un 429 sigue aunque se cambie de vista.
  const signIn = useRateLimitedForm();
  const forgotPassword = useRateLimitedForm();
  const firstPassword = useRateLimitedForm();
  const accessRequest = useRateLimitedForm();

  const show = (target: View) => {
    for (const form of [signIn, forgotPassword, firstPassword, accessRequest]) form.clearError();
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

  // El panel se descarga mientras se escriben las credenciales: al entrar aparece en el acto.
  useEffect(() => {
    router.prefetch(destination);
  }, [router, destination]);

  const enterCampus = ({ token, user }: OpenedSession) => {
    login(token, user);
    startEntering(() => router.push(destination));
  };

  // Equivocarse de sede es lo más probable y el rechazo no puede decir en cuál está la cuenta.
  // Recuperar la contraseña no depende de ella, y con el correo de la solicitud ya verificado
  // la sede quedó elegida.
  const showSite = view !== 'forgot-password' && !(view === 'request' && requestEmailVerified);

  return (
    <>
      <AccessHeader
        view={view}
        titleId={dialog?.titleId}
        logoUrl={fileUrlFor(config?.logoUrl)}
        // El mensaje de bienvenida lo escribe cada sede desde «Tema y apariencia».
        description={(view === 'sign-in' && config?.welcomeMessage?.trim()) || DESCRIPTIONS[view]}
      />

      {showSite && (
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
        <>
          <SignInForm
            form={signIn}
            country={country}
            email={email}
            onEmailChange={setEmail}
            onSetupRequired={requireSetup}
            onSignedIn={enterCampus}
            entering={entering}
          />
          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => show('forgot-password')}
              className={`${QUIET_LINK} hover:text-primary`}
            >
              <Lock className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
            </button>
            <button
              type="button"
              onClick={() => show('request')}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
            >
              <User className="h-4 w-4" /> Solicitar acceso al campus
            </button>
            {dialog ? (
              <button type="button" onClick={dialog.onClose} className={`mt-1 ${QUIET_LINK} hover:text-foreground`}>
                <Home className="h-3.5 w-3.5" /> Volver al inicio
              </button>
            ) : (
              <Link href="/" className={`mt-1 ${QUIET_LINK} hover:text-foreground`}>
                <Home className="h-3.5 w-3.5" /> Volver al inicio
              </Link>
            )}
          </div>
        </>
      )}

      {view === 'forgot-password' && (
        <ForgotPasswordForm form={forgotPassword} backToSignIn={<BackToSignIn onClick={backToSignIn} />} />
      )}

      {view === 'first-password' && pendingSetup && (
        <FirstPasswordForm
          form={firstPassword}
          setup={pendingSetup}
          onCancel={backToSignIn}
          onSignedIn={enterCampus}
          entering={entering}
        />
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
    </>
  );
}

const HEADER_ICONS: Partial<Record<View, typeof GraduationCap>> = {
  'forgot-password': Mail,
  'first-password': ShieldCheck,
};

function AccessHeader({
  view,
  titleId,
  logoUrl,
  description,
}: {
  view: View;
  /** Dentro de una ventana el título es el suyo; la página ya no tiene otro encabezado. */
  titleId?: string;
  logoUrl: string | null;
  description: string;
}) {
  // El aviso de sesión y la confirmación de la solicitud traen su propio icono.
  const showIcon = view !== 'notice' && view !== 'request-sent';
  const Icon = HEADER_ICONS[view] ?? GraduationCap;
  const Title = titleId ? 'h2' : 'h1';

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
        <Title id={titleId} className="text-2xl font-bold tracking-tight">
          {TITLES[view]}
        </Title>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
