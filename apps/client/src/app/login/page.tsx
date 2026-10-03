'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, GraduationCap, Home, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import api, { errorMessage, fileUrlFor, type LogoutReason } from '@/lib/api';
import { COUNTRY_INFO } from '@/lib/country';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { CountrySwitcher } from '@/components/features/CountrySwitcher';
import { useCountry } from '@/contexts/CountryContext';
import { useSession, SessionUser } from '@/contexts/SessionContext';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { SessionAlert } from './components/SessionAlert';
import { AccessRequestForm } from './components/AccessRequestForm';

type View = 'login' | 'first-password' | 'request' | 'request-sent' | 'notice';

interface LoginResponse {
  requireSetup?: true;
  message: string;
  token?: string;
  user: SessionUser | { email: string; firstName: string };
}

const VALID_REASONS: LogoutReason[] = ['expired', 'revoked', 'displaced'];

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <PageLoader message="Cargando campus…" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { country, ready: countryReady } = useCountry();
  const { login } = useSession();
  const { config } = useConfig();

  const [view, setView] = useState<View>('login');
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  /** Explicación del servidor de por qué hay que crear la contraseña antes de entrar. */
  const [setupMessage, setSetupMessage] = useState('');

  // Motivo por el que el usuario llegó aquí sin pedirlo. Se limpia de la URL para que al
  // recargar no vuelva a aparecer el mismo mensaje.
  useEffect(() => {
    const reason = params?.get('reason');
    if (!reason || !VALID_REASONS.includes(reason as LogoutReason)) return;

    setLogoutReason(reason as LogoutReason);
    setView('notice');
    window.history.replaceState({}, '', '/login');
  }, [params]);

  const backToLogin = () => {
    setView('login');
    setError('');
    setSetupMessage('');
    setPassword('');
    setNewPassword('');
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password, country });

      if (data.requireSetup) {
        setSetupMessage(data.message);
        setView('first-password');
        return;
      }

      completeLogin(data);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo iniciar sesión.'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(newPassword);
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post<LoginResponse>('/auth/set-password', {
        email,
        temporaryPassword: password,
        newPassword,
      });
      completeLogin(data);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo establecer la contraseña.'));
    } finally {
      setSubmitting(false);
    }
  };

  const completeLogin = (response: LoginResponse) => {
    if (!response.token) {
      setError('La respuesta del servidor no incluyó la sesión. Inténtalo de nuevo.');
      return;
    }
    login(response.token, response.user as SessionUser);
    setLoggingIn(true);
    router.push('/dashboard');
  };

  if (!countryReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <PageLoader message="Cargando campus…" />
      </div>
    );
  }

  // Ya en el marco del panel: el indicador sigue en el mismo sitio cuando el panel lo releva.
  if (loggingIn) {
    return (
      <DashboardShell>
        <PageLoader message="Entrando al campus…" />
      </DashboardShell>
    );
  }

  const background = fileUrlFor(config?.loginBackgroundUrl);
  const logo = fileUrlFor(config?.logoUrl);
  // El mensaje de bienvenida lo escribe cada sede desde «Tema y apariencia».
  const description = (view === 'login' && config?.welcomeMessage?.trim()) || DESCRIPTIONS[view];

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
      {background ? (
        <img src={background} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] z-0" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary/30 blur-[100px] z-0" />
        </>
      )}

      <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-xl p-8 relative z-10 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center gap-4 mb-7">
          {logo && view === 'login' ? (
            <img src={logo} alt="" className="max-h-20 max-w-[200px] object-contain" />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              {view === 'first-password' ? (
                <ShieldCheck className="h-7 w-7 text-primary" />
              ) : (
                <GraduationCap className="h-7 w-7 text-primary" />
              )}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold tracking-tight">{TITLES[view]}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Recordatorio de sede. Entrar en la equivocada es el error más probable y el
            mensaje de rechazo no puede decir en cuál está la cuenta, así que se avisa
            antes; el cambio se ofrece aquí mismo para no obligar a volver a la portada. */}
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <CountryFlag country={country} size="sm" />
          <p className="flex-1 text-xs leading-snug text-muted-foreground">
            {view === 'request' ? 'Solicitas acceso a la sede de ' : 'Entrando en la sede de '}
            <strong className="text-foreground">{COUNTRY_INFO[country].name}</strong>.{' '}
            {view === 'request' ? 'Tu cuenta pertenecerá sólo a ella.' : 'Tu cuenta pertenece a una sola.'}
          </p>
          <CountrySwitcher />
        </div>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive text-center"
          >
            {error}
          </p>
        )}

        {setupMessage && view === 'first-password' && (
          <p className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 text-center">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {setupMessage}
          </p>
        )}

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  placeholder="nombre@empresa.com"
                  className="h-12 w-full rounded-xl border border-input bg-background/60 pl-11 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 w-full rounded-xl border border-input bg-background/60 pl-11 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? 'Comprobando…' : 'Entrar'}
            </button>
          </form>
        )}

        {view === 'first-password' && (
          <form onSubmit={submitNewPassword} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                Tu nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4.5 w-4.5 text-primary" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-12 w-full rounded-xl border border-primary/30 bg-primary/5 pl-11 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={backToLogin}
                className="h-12 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Guardando…' : 'Guardar y entrar'}
              </button>
            </div>
          </form>
        )}

        {view === 'request' && (
          <AccessRequestForm country={country} onCancel={backToLogin} onSubmitted={() => setView('request-sent')} />
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
              onClick={backToLogin}
              className="h-11 w-full rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted transition-colors"
            >
              Volver al acceso
            </button>
          </div>
        )}

        {view === 'notice' && logoutReason && <SessionAlert reason={logoutReason} onContinue={backToLogin} />}

        {view === 'login' && (
          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
            </Link>
            <button
              type="button"
              onClick={() => {
                setView('request');
                setError('');
              }}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
            >
              <User className="h-4 w-4" /> Solicitar acceso al campus
            </button>
            <Link
              href="/"
              className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Home className="h-3.5 w-3.5" /> Volver al inicio
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

const TITLES: Record<View, string> = {
  login: 'Acceso al campus',
  'first-password': 'Crea tu contraseña',
  request: 'Solicitar acceso',
  'request-sent': 'Solicitud enviada',
  notice: 'Tu sesión terminó',
};

const DESCRIPTIONS: Record<View, string> = {
  login: 'Introduce tus credenciales para entrar.',
  'first-password': 'Tu cuenta usa todavía la contraseña temporal. Elige una propia para poder continuar.',
  request: 'El registro no es automático: un administrador revisa cada solicitud.',
  'request-sent': 'Ya está en manos de la administración de tu sede.',
  notice: 'Esto es lo que ocurrió.',
};
