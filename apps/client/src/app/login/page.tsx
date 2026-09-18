'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, GraduationCap, Home, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import api, { mensajeDeError, urlDeArchivo } from '@/lib/api';
import { SEDES } from '@/lib/pais';
import { useSede } from '@/contexts/SedeContext';
import { useRole, UsuarioSesion } from '@/contexts/RoleContext';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { SelectorDeSede } from '@/components/features/SelectorDeSede';
import { AvisoDeSesion, MotivoDeSalida } from './components/AvisoDeSesion';
import { SolicitudDeAcceso } from './components/SolicitudDeAcceso';

type Vista = 'acceso' | 'primera-contrasena' | 'solicitud' | 'solicitud-enviada' | 'aviso';

interface RespuestaAcceso {
  requireSetup?: true;
  message: string;
  token?: string;
  user: UsuarioSesion | { email: string; nombre: string };
}

const MOTIVOS_VALIDOS: MotivoDeSalida[] = ['expirada', 'revocada', 'desplazada'];

export default function PaginaDeAcceso() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <PageLoader message="Cargando…" />
        </div>
      }
    >
      <ContenidoDeAcceso />
    </Suspense>
  );
}

function ContenidoDeAcceso() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { sede, listo: sedeLista } = useSede();
  const { iniciarSesion } = useRole();
  const { config } = useConfig();

  const [vista, setVista] = useState<Vista>('acceso');
  const [motivoDeSalida, setMotivoDeSalida] = useState<MotivoDeSalida | null>(null);

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  // Motivo por el que el usuario llegó aquí sin pedirlo. Se limpia de la URL para que al
  // recargar no vuelva a aparecer el mismo mensaje.
  useEffect(() => {
    const motivo = parametros?.get('motivo');
    if (!motivo || !MOTIVOS_VALIDOS.includes(motivo as MotivoDeSalida)) return;

    setMotivoDeSalida(motivo as MotivoDeSalida);
    setVista('aviso');
    window.history.replaceState({}, '', '/login');
  }, [parametros]);

  const volverAlAcceso = () => {
    setVista('acceso');
    setError('');
    setAviso('');
    setContrasena('');
    setNuevaContrasena('');
  };

  const acceder = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!sede) return;

    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<RespuestaAcceso>('/auth/login', {
        email: correo,
        contrasena,
        pais: sede,
      });

      if (data.requireSetup) {
        setAviso(data.message);
        setVista('primera-contrasena');
        return;
      }

      entrar(data);
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo iniciar sesión.'));
    } finally {
      setEnviando(false);
    }
  };

  const establecerContrasena = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const { data } = await api.post<RespuestaAcceso>('/auth/establecer-password', {
        email: correo,
        contrasenaTemporal: contrasena,
        nuevaContrasena,
      });
      entrar(data);
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo establecer la contraseña.'));
    } finally {
      setEnviando(false);
    }
  };

  const entrar = (respuesta: RespuestaAcceso) => {
    if (!respuesta.token) {
      setError('La respuesta del servidor no incluyó la sesión. Inténtalo de nuevo.');
      return;
    }
    iniciarSesion(respuesta.token, respuesta.user as UsuarioSesion);
    setEntrando(true);
    router.push('/dashboard');
  };

  if (!sedeLista) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <PageLoader message="Cargando campus…" />
      </div>
    );
  }

  // Sin sede elegida no se puede ni mostrar el formulario: la sede forma parte de las
  // credenciales, porque la misma pantalla atiende a dos operaciones distintas.
  if (!sede) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-muted/30">
        <SelectorDeSede
          titulo="¿A qué sede quieres entrar?"
          descripcion="Tu cuenta pertenece a una sola sede. Elige la tuya para continuar."
        />
      </main>
    );
  }

  if (entrando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <PageLoader message="Entrando al campus…" />
      </div>
    );
  }

  const fondo = urlDeArchivo(config?.login_fondo_url);
  const logo = urlDeArchivo(config?.logo_url);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
      {fondo ? (
        <img src={fondo} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-primary/20 blur-[100px] z-0" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-secondary/30 blur-[100px] z-0" />
        </>
      )}

      <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-xl p-8 relative z-10 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center gap-4 mb-7">
          {logo && vista === 'acceso' ? (
            <img src={logo} alt="" className="max-h-20 max-w-[200px] object-contain" />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              {vista === 'primera-contrasena' ? (
                <ShieldCheck className="h-7 w-7 text-emerald-500" />
              ) : (
                <GraduationCap className="h-7 w-7 text-primary" />
              )}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold tracking-tight">{TITULOS[vista]}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{DESCRIPCIONES[vista]}</p>
          </div>
        </div>

        {/* Advertencia de sede: siempre visible, porque entrar en la equivocada es el
            error más probable y el mensaje de rechazo no puede revelar en cuál está la
            cuenta. */}
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden="true">
              {SEDES[sede].bandera}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Vas a entrar en la sede de {SEDES[sede].nombre}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Colombia y México son operaciones separadas y sus datos no se mezclan. Si tu cuenta es de la otra
                sede, el acceso será rechazado.
              </p>
              <a href="/" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">
                Cambiar de sede
              </a>
            </div>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive text-center"
          >
            {error}
          </p>
        )}

        {aviso && vista === 'primera-contrasena' && (
          <p className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 text-center">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {aviso}
          </p>
        )}

        {vista === 'acceso' && (
          <form onSubmit={acceder} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="correo" className="text-sm font-medium">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                <input
                  id="correo"
                  type="email"
                  value={correo}
                  onChange={(evento) => setCorreo(evento.target.value)}
                  required
                  autoComplete="email"
                  placeholder="nombre@empresa.com"
                  className="h-12 w-full rounded-xl border border-input bg-background/60 pl-11 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contrasena" className="text-sm font-medium">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                <input
                  id="contrasena"
                  type={verContrasena ? 'text' : 'password'}
                  value={contrasena}
                  onChange={(evento) => setContrasena(evento.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 w-full rounded-xl border border-input bg-background/60 pl-11 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setVerContrasena((valor) => !valor)}
                  aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {verContrasena ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {enviando ? 'Comprobando…' : 'Entrar'}
            </button>
          </form>
        )}

        {vista === 'primera-contrasena' && (
          <form onSubmit={establecerContrasena} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="nueva-contrasena" className="text-sm font-medium">
                Tu nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4.5 w-4.5 text-emerald-500" />
                <input
                  id="nueva-contrasena"
                  type={verContrasena ? 'text' : 'password'}
                  value={nuevaContrasena}
                  onChange={(evento) => setNuevaContrasena(evento.target.value)}
                  required
                  autoComplete="new-password"
                  className="h-12 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 pl-11 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setVerContrasena((valor) => !valor)}
                  aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-3.5 text-emerald-600/70 hover:text-emerald-600 transition-colors"
                >
                  {verContrasena ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres, con al menos una letra y un número.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={volverAlAcceso}
                className="h-12 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="flex-1 h-12 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
              >
                {enviando ? 'Guardando…' : 'Guardar y entrar'}
              </button>
            </div>
          </form>
        )}

        {vista === 'solicitud' && (
          <SolicitudDeAcceso
            sede={sede}
            onCancelar={volverAlAcceso}
            onEnviada={() => setVista('solicitud-enviada')}
          />
        )}

        {vista === 'solicitud-enviada' && (
          <div className="flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-6 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              Un administrador de la sede de {SEDES[sede].nombre} revisará tu solicitud. Recibirás un correo con tus
              datos de acceso en cuanto la apruebe.
            </p>
            <button
              type="button"
              onClick={volverAlAcceso}
              className="h-11 w-full rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted transition-colors"
            >
              Volver al acceso
            </button>
          </div>
        )}

        {vista === 'aviso' && motivoDeSalida && (
          <AvisoDeSesion motivo={motivoDeSalida} onContinuar={volverAlAcceso} />
        )}

        {vista === 'acceso' && (
          <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
            <a
              href="/recuperar-contrasena"
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <Lock className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
            </a>
            <button
              type="button"
              onClick={() => {
                setVista('solicitud');
                setError('');
              }}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
            >
              <User className="h-4 w-4" /> Solicitar acceso al campus
            </button>
            <a
              href="/"
              className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Home className="h-3.5 w-3.5" /> Volver al inicio
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

const TITULOS: Record<Vista, string> = {
  acceso: 'Acceso al campus',
  'primera-contrasena': 'Crea tu contraseña',
  solicitud: 'Solicitar acceso',
  'solicitud-enviada': 'Solicitud enviada',
  aviso: 'Tu sesión terminó',
};

const DESCRIPCIONES: Record<Vista, string> = {
  acceso: 'Introduce tus credenciales para entrar.',
  'primera-contrasena':
    'Tu cuenta usa todavía la contraseña temporal. Elige una propia para poder continuar.',
  solicitud: 'El registro no es automático: un administrador revisa cada solicitud.',
  'solicitud-enviada': 'Ya está en manos de la administración de tu sede.',
  aviso: 'Esto es lo que ocurrió.',
};
