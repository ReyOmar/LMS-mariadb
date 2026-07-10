'use client';

import { useState } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  User,
  Info,
  Eye,
  EyeOff,
  ShieldAlert,
  Clock,
  Monitor,
  CheckCircle2,
  Send,
  Loader2,
  Home,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRole } from '@/contexts/RoleContext';
import { useConfig, resolveFileUrl } from '@/contexts/ConfigContext';
import api from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { syncSession } = useRole();
  const { config } = useConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [rolPedido, setRolPedido] = useState('ESTUDIANTE');

  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [view, setView] = useState<
    'LOGIN' | 'SETUP_PASSWORD' | 'REQUEST_ACCESS' | 'REQUEST_SUCCESS' | 'REVOKED' | 'EXPIRED' | 'DISPLACED'
  >('LOGIN');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const { showAlert, showToast } = useAlert();

  // Email verification state
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationStep, setVerificationStep] = useState<'email' | 'code' | 'form'>('email');
  const [codeSending, setCodeSending] = useState(false);
  const [codeVerifying, setCodeVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const revoked = searchParams?.get('revoked') === 'true';
    const displaced = searchParams?.get('displaced') === 'true';
    const expired = searchParams?.get('expired') === 'true';

    if (revoked || displaced || expired) {
      if (revoked) setView('REVOKED');
      else if (displaced) setView('DISPLACED');
      else if (expired) setView('EXPIRED');
      // Clean the URL params so a page refresh won't re-trigger
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const handleGoToLogin = () => {
    setEmail('');
    setPassword('');
    setNewPassword('');
    setNombre('');
    setApellido('');
    setErrorMsg('');
    setSuccessMsg('');
    setRateLimited(false);
    setView('LOGIN');
  };

  const handleGoToRequest = () => {
    setEmail('');
    setPassword('');
    setNewPassword('');
    setNombre('');
    setApellido('');
    setErrorMsg('');
    setSuccessMsg('');
    setRateLimited(false);
    setView('REQUEST_ACCESS');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data } = await api.post('/auth/login', { email, contrasena: password });

      if (data.requireSetup) {
        setSuccessMsg(data.message);
        setView('SETUP_PASSWORD');
        return;
      }

      // Sync context and redirect
      syncSession(data.token, data.user);
      setRedirecting(true);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 429) {
        setErrorMsg('Demasiadas peticiones. Por favor, intenta más tarde.');
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), 30000);
      } else {
        setErrorMsg(err.response?.data?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // Backend now returns token + user directly from setup (auto-login)
      const { data } = await api.post('/auth/establecer-password', {
        email,
        contrasenaTemporal: password,
        nuevaContrasena: newPassword,
      });

      if (data.token && data.user) {
        syncSession(data.token, data.user);
        showToast.success('Tu contraseña ha sido configurada exitosamente.');
        setRedirecting(true);
        router.push('/dashboard');
      } else {
        showToast.success(data.message || 'Ahora puedes iniciar sesión con tu nueva contraseña.');
        handleGoToLogin();
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setErrorMsg('Demasiadas peticiones. Por favor, intenta más tarde.');
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), 30000);
      } else {
        setErrorMsg(err.response?.data?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      await api.post('/auth/solicitar', { email, nombre, apellido, rol_pedido: rolPedido });
      setView('REQUEST_SUCCESS');
    } catch (err: any) {
      if (err.response?.status === 429) {
        setErrorMsg('Demasiadas peticiones. Por favor, intenta más tarde.');
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), 30000);
      } else {
        const msg = err.response?.data?.message || err.message;
        if (msg.toLowerCase().includes('ya existe')) {
          showToast.info('El correo proporcionado ya se encuentra en el sistema. Inicia sesión.');
          handleGoToLogin();
        } else {
          setErrorMsg(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerification = async () => {
    if (!email || !email.includes('@')) {
      setErrorMsg('Ingresa un correo electrónico válido.');
      return;
    }
    setCodeSending(true);
    setErrorMsg('');
    try {
      await api.post('/auth/verificar-email', { email });
      setVerificationStep('code');
      setSuccessMsg('Código enviado. Revisa tu bandeja de entrada.');
      setCountdown(60);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al enviar el código.');
    } finally {
      setCodeSending(false);
    }
  };

  const handleConfirmCode = async () => {
    if (verificationCode.length !== 6) {
      setErrorMsg('Ingresa el código de 6 dígitos.');
      return;
    }
    setCodeVerifying(true);
    setErrorMsg('');
    try {
      await api.post('/auth/confirmar-email', { email, codigo: verificationCode });
      setEmailVerified(true);
      setVerificationStep('form');
      setSuccessMsg('¡Correo verificado!');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Código inválido.');
    } finally {
      setCodeVerifying(false);
    }
  };

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <PageLoader message="Ingresando al campus..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 transition-colors relative overflow-hidden">
      {/* Dynamic Background - custom image or abstract blobs */}
      {config?.login_fondo_url ? (
        <img
          src={resolveFileUrl(config.login_fondo_url) || ''}
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-0 opacity-100"
        />
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] z-0" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary/30 blur-[100px] z-0" />
        </>
      )}

      <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-xl p-8 relative z-10 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          {config?.logo_url && view === 'LOGIN' ? (
            <div className="flex items-center justify-center mb-2">
              <img
                src={resolveFileUrl(config.logo_url) || ''}
                alt="Logo"
                className="max-h-24 max-w-[200px] object-contain"
              />
            </div>
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2 ring-1 ring-primary/20">
              {view === 'SETUP_PASSWORD' ? (
                <ShieldCheck className="h-7 w-7 text-emerald-500" />
              ) : view === 'EXPIRED' ? (
                <Clock className="h-7 w-7 text-primary" />
              ) : view === 'DISPLACED' ? (
                <Monitor className="h-7 w-7 text-primary" />
              ) : (
                <GraduationCap className="h-7 w-7 text-primary" />
              )}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {view === 'LOGIN' && (config?.mensaje_bienvenida || 'Bienvenido a PESV Education')}
              {view === 'SETUP_PASSWORD' && 'Aprobado: Setup Guardián'}
              {view === 'REQUEST_ACCESS' && 'Solicitar Acceso Privado'}
              {view === 'REQUEST_SUCCESS' && 'Petición en Tránsito'}
              {view === 'EXPIRED' && 'Sesión Expirada'}
              {view === 'DISPLACED' && 'Sesión Activa en Otro Dispositivo'}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {view === 'LOGIN' && 'Ingresa tus credenciales para ser validado en base de datos.'}
              {view === 'SETUP_PASSWORD' &&
                'Tu cuenta fue dada de alta por la Administración. Ingresa una contraseña personal y secreta solo para ti.'}
              {view === 'REQUEST_ACCESS' &&
                'Registro cerrado. Envía tu información para que la administración determine tu pase.'}
              {view === 'REQUEST_SUCCESS' &&
                'Tu petición se ha registrado y está en espera de aprobación, contacta al administrador.'}
              {view === 'REVOKED' && 'No tienes autorización para acceder al sistema.'}
              {view === 'EXPIRED' && 'Tu sesión anterior ha expirado. Inicia sesión de nuevo para continuar.'}
              {view === 'DISPLACED' &&
                'Se inició sesión con tu cuenta en otro dispositivo. Solo puedes tener una sesión activa a la vez.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm font-semibold max-w-full text-center">
            {errorMsg}
          </div>
        )}

        {successMsg && (view === 'SETUP_PASSWORD' || view === 'REQUEST_ACCESS') && (
          <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 text-sm font-semibold max-w-full text-center animate-in fade-in slide-in-from-top-2 duration-300 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {/* ===================== VIEW: LOGIN ===================== */}
        {view === 'LOGIN' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Correo Módulo PESV</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="Correo"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-xl border border-input bg-background/50 pl-11 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-xl border border-input bg-background/50 pl-11 pr-11 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                  >
                    {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || rateLimited}
              className="group relative inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
            >
              {loading ? 'Validando...' : rateLimited ? 'Bloqueado Temporalmente' : 'Ingresar Seguro'}
            </button>
          </form>
        )}

        {/* ===================== VIEW: SETUP INITIAL PASSWORD ===================== */}
        {view === 'SETUP_PASSWORD' && (
          <form onSubmit={handleSetupPassword} className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Nueva Contraseña Secreta</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-emerald-500" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Minimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="flex h-11 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 pl-11 pr-11 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-emerald-500/70 hover:text-emerald-500 transition-colors focus:outline-none"
                >
                  {showNewPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || rateLimited}
              className="w-full h-11 rounded-xl bg-emerald-600 px-8 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-70"
            >
              {loading ? 'Encriptando...' : rateLimited ? 'Bloqueado Temporalmente' : 'Firmar e Ingresar'}
            </button>
          </form>
        )}

        {/* ===================== VIEW: REQUEST ACCESS ===================== */}
        {view === 'REQUEST_ACCESS' && (
          <div className="space-y-4 animate-in fade-in">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-2">
              {['email', 'code', 'form'].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      verificationStep === step
                        ? 'bg-primary text-primary-foreground scale-110'
                        : i < ['email', 'code', 'form'].indexOf(verificationStep)
                          ? 'bg-emerald-500 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i < ['email', 'code', 'form'].indexOf(verificationStep) ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  {i < 2 && (
                    <div
                      className={`w-8 h-0.5 rounded transition-colors ${i < ['email', 'code', 'form'].indexOf(verificationStep) ? 'bg-emerald-500' : 'bg-muted'}`}
                    />
                  )}
                </div>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {verificationStep === 'email'
                  ? 'Verificar correo'
                  : verificationStep === 'code'
                    ? 'Ingresar código'
                    : 'Completar solicitud'}
              </span>
            </div>

            {/* Step 1: Email */}
            {verificationStep === 'email' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">Correo Electrónico</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full h-10 rounded-lg border border-input pl-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGoToLogin}
                    className="h-10 px-4 text-xs font-bold text-muted-foreground rounded-lg border border-border hover:bg-muted"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={codeSending || !email}
                    className="flex-1 h-10 rounded-lg bg-primary text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {codeSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" /> Verificar Correo
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Code */}
            {verificationStep === 'code' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Enviamos un código de 6 dígitos a <strong>{email}</strong>
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">Código de Verificación</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full h-12 rounded-lg border border-input text-center text-2xl font-mono font-bold tracking-[0.5em] focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep('email');
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="h-10 px-4 text-xs font-bold text-muted-foreground rounded-lg border border-border hover:bg-muted"
                  >
                    Cambiar correo
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCode}
                    disabled={codeVerifying || verificationCode.length !== 6}
                    className="flex-1 h-10 rounded-lg bg-primary text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {codeVerifying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Confirmar Código
                      </>
                    )}
                  </button>
                </div>
                <div className="text-center">
                  {countdown > 0 ? (
                    <span className="text-xs text-muted-foreground">Reenviar en {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      disabled={codeSending}
                      className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1.5 transition-all"
                    >
                      {codeSending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Reenviando...
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" /> Reenviar código
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Full form */}
            {verificationStep === 'form' && (
              <form
                onSubmit={handleRequestAccess}
                className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300"
              >
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    <strong>{email}</strong> verificado correctamente
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground">Nombre</label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                      className="w-full h-10 rounded-lg border border-input pl-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground">Apellido</label>
                    <input
                      type="text"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      required
                      className="w-full h-10 rounded-lg border border-input pl-3 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">Cargo Pedido (Para Asignaciones)</label>
                  <select
                    value={rolPedido}
                    onChange={(e) => setRolPedido(e.target.value)}
                    className="w-full h-10 rounded-lg border border-input pl-3 text-sm focus-visible:ring-2 focus-visible:ring-primary bg-background"
                  >
                    <option value="ESTUDIANTE">Capacitante</option>
                    <option value="PROFESOR">Examinador</option>
                  </select>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={handleGoToLogin}
                    className="h-10 px-4 text-xs font-bold text-muted-foreground rounded-lg border border-border hover:bg-muted"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || rateLimited}
                    className="flex-1 h-10 rounded-lg bg-primary text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-70"
                  >
                    {loading
                      ? 'Elevando Petición...'
                      : rateLimited
                        ? 'Bloqueado Temporalmente'
                        : 'Solicitar a Prevención'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ===================== VIEW: SUCCESS REQUEST ===================== */}
        {view === 'REQUEST_SUCCESS' && (
          <div className="flex flex-col items-center text-center animate-in zoom-in-95">
            <div className="text-emerald-500 font-bold bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 mb-6">
              Tu petición se ha registrado y está en espera de aprobación, contacta al administrador.
            </div>
            <button
              onClick={handleGoToLogin}
              className="h-11 w-full rounded-xl bg-card border border-border hover:bg-muted font-bold text-sm shadow-sm transition-colors"
            >
              Volver al Inicio
            </button>
          </div>
        )}

        {/* ===================== VIEW: REVOKED ===================== */}
        {view === 'REVOKED' && (
          <div className="flex flex-col items-center text-center animate-in zoom-in-95">
            <div className="h-16 w-16 rounded-3xl bg-red-500/10 flex items-center justify-center mb-6 ring-1 ring-red-500/20">
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            <div className="text-muted-foreground p-2 mb-6">
              Tu sesión ha sido cerrada por un administrador o tu cuenta ha sido{' '}
              <span className="font-bold text-foreground">eliminada del sistema</span> de forma permanente.
            </div>
            <button
              onClick={handleGoToLogin}
              className="h-11 w-full rounded-xl bg-red-600 text-white hover:bg-red-700 font-bold text-sm shadow-sm transition-colors"
            >
              Volver al Inicio Seguro
            </button>
          </div>
        )}

        {/* ===================== VIEW: EXPIRED (friendly re-login) ===================== */}
        {view === 'EXPIRED' && (
          <div className="flex flex-col items-center text-center animate-in zoom-in-95">
            <div className="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-6 ring-1 ring-primary/20">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <div className="text-muted-foreground p-2 mb-6">
              Tu sesión anterior ha <span className="font-bold text-foreground">expirado</span>.
              <br />
              Esto es normal — inicia sesión de nuevo para continuar.
            </div>
            <button
              onClick={handleGoToLogin}
              className="h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm shadow-sm transition-colors"
            >
              Iniciar Sesión
            </button>
          </div>
        )}

        {/* ===================== VIEW: DISPLACED (single-session policy) ===================== */}
        {view === 'DISPLACED' && (
          <div className="flex flex-col items-center text-center animate-in zoom-in-95">
            <div className="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-6 ring-1 ring-primary/20">
              <Monitor className="h-8 w-8 text-primary" />
            </div>
            <div className="text-muted-foreground p-2 mb-6">
              Se detectó un <span className="font-bold text-foreground">inicio de sesión en otro dispositivo</span>.
              <br />
              Por seguridad, solo se permite <span className="font-bold text-foreground">una sesión activa</span> a la
              vez.
            </div>
            <button
              onClick={handleGoToLogin}
              className="h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm shadow-sm transition-colors"
            >
              Volver a Iniciar Sesión
            </button>
          </div>
        )}

        {/* Footer Toggle */}
        {view === 'LOGIN' && (
          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
            <a
              href="/recuperar-contrasena"
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
            </a>
            <button
              onClick={handleGoToRequest}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
            >
              <User className="h-4 w-4" /> Registrar Petición de Monitoreo
            </button>
            <a
              href="/"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mt-1"
            >
              <Home className="h-3.5 w-3.5" /> Volver al Inicio
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
