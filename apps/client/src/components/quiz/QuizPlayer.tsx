'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  LogOut,
  Paperclip,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react';
import api, { mensajeDeError, urlDeArchivo } from '@/lib/api';
import { formatearPuntos, NOTA_MAXIMA } from '@/lib/calificacion';
import { useAlert } from '@/contexts/AlertContext';
import { sanitizeHTML } from '@/lib/sanitize';

/**
 * Realización de un cuestionario.
 *
 * Las preguntas **no llegan con la ficha del curso**: se piden al abrir el intento, y el
 * servidor las devuelve sin la marca de cuál es la opción correcta. Antes la configuración
 * completa —respuestas incluidas— viajaba dentro del curso, de modo que estaban en el
 * navegador del alumno antes de empezar el examen.
 *
 * La corrección también ocurre sólo en el servidor: aquí no hay forma de calcular la nota.
 */

interface Opcion {
  id: string;
  texto: string;
}

interface Pregunta {
  id: string;
  enunciado: string;
  opciones: Opcion[];
}

interface EstadoDelQuiz {
  intentos_realizados: number;
  max_intentos: number;
  mejor_nota: number | null;
  nota_aprobacion: number;
  aprobado: boolean;
  intento_en_curso: boolean;
  fecha_inicio: string | null;
  tiempo_minutos: number;
  puede_reintentar: boolean;
  motivo_bloqueo: string | null;
}

interface Resultado {
  nota: number;
  aprobado: boolean;
  correctas: number;
  total: number;
  fuera_de_tiempo: boolean;
}

interface QuizPlayerProps {
  recurso_guid: string;
  bloque_titulo: string;
  instrucciones_html?: string;
  url_referencia?: string | null;
  /** URL firmada del material de apoyo, tal y como la devuelve la API. */
  archivo_adjunto_url?: string | null;
  archivo_adjunto_nombre?: string | null;
  /** Se invoca al cerrar el intento; `aprobado` decide si el curso puede continuar. */
  onFinish: (aprobado: boolean) => void;
  onQuizStateChange?: (enCurso: boolean) => void;
}

export default function QuizPlayer({
  recurso_guid,
  bloque_titulo,
  instrucciones_html,
  url_referencia,
  archivo_adjunto_url,
  archivo_adjunto_nombre,
  onFinish,
  onQuizStateChange,
}: QuizPlayerProps) {
  const { showAlert } = useAlert();

  const [estado, setEstado] = useState<EstadoDelQuiz | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);

  const [cargando, setCargando] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const enCurso = preguntas.length > 0 && !resultado;
  const claveBorrador = `quiz_respuestas_${recurso_guid}`;

  // ── Carga ──────────────────────────────────────────────────────────────

  const cargarEstado = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get<EstadoDelQuiz>(`/cursos/quiz/${recurso_guid}/estado`);
      setEstado(data);
      return data;
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo cargar el cuestionario.'));
      return null;
    } finally {
      setCargando(false);
    }
  }, [recurso_guid]);

  useEffect(() => {
    void cargarEstado().then((datos) => {
      // Si quedó un intento abierto (recarga, cierre accidental), se retoma solo.
      if (datos?.intento_en_curso) void retomarIntento(datos);
    });
    // `retomarIntento` sólo depende de `recurso_guid`, ya cubierto por `cargarEstado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarEstado]);

  /** Recupera un intento ya abierto: mismas preguntas y el cronómetro donde iba. */
  const retomarIntento = async (datos: EstadoDelQuiz) => {
    try {
      const { data } = await api.post<{ fecha_inicio: string; tiempo_minutos: number; preguntas: Pregunta[] }>(
        `/cursos/quiz/${recurso_guid}/iniciar`,
      );
      setPreguntas(data.preguntas);
      onQuizStateChange?.(true);
      restaurarBorrador();
      ajustarCronometro(data.fecha_inicio, data.tiempo_minutos || datos.tiempo_minutos);
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo retomar el intento.'));
    }
  };

  const restaurarBorrador = () => {
    try {
      const guardado = window.localStorage.getItem(claveBorrador);
      if (guardado) setRespuestas(JSON.parse(guardado));
    } catch {
      // Sin borrador se empieza en blanco; no es motivo para interrumpir el examen.
    }
  };

  /** Calcula el tiempo que queda a partir del inicio real registrado en el servidor. */
  const ajustarCronometro = (inicio: string | null, minutos: number) => {
    if (!inicio || minutos <= 0) {
      setSegundosRestantes(null);
      return;
    }
    const transcurridos = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    setSegundosRestantes(Math.max(0, minutos * 60 - transcurridos));
  };

  // Las respuestas se guardan localmente por si la pestaña se cierra a mitad del examen.
  useEffect(() => {
    if (!enCurso || Object.keys(respuestas).length === 0) return;
    try {
      window.localStorage.setItem(claveBorrador, JSON.stringify(respuestas));
    } catch {
      /* el examen sigue igual sin borrador */
    }
  }, [respuestas, enCurso, claveBorrador]);

  // ── Cronómetro ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enCurso || segundosRestantes === null) return;

    if (segundosRestantes <= 0) {
      void enviarRespuestas();
      return;
    }

    const temporizador = setTimeout(() => setSegundosRestantes((valor) => (valor ?? 1) - 1), 1000);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segundosRestantes, enCurso]);

  // ── Acciones ───────────────────────────────────────────────────────────

  const iniciarIntento = async () => {
    setIniciando(true);
    setError(null);
    try {
      const { data } = await api.post<{ fecha_inicio: string; tiempo_minutos: number; preguntas: Pregunta[] }>(
        `/cursos/quiz/${recurso_guid}/iniciar`,
      );
      setPreguntas(data.preguntas);
      setRespuestas({});
      ajustarCronometro(data.fecha_inicio, data.tiempo_minutos);
      onQuizStateChange?.(true);
    } catch (fallo) {
      showAlert.error('No se pudo comenzar', mensajeDeError(fallo));
    } finally {
      setIniciando(false);
    }
  };

  const enviarRespuestas = async () => {
    if (enviando) return;
    setEnviando(true);
    setConfirmarEnvio(false);
    try {
      const { data } = await api.post<Resultado>(`/cursos/quiz/${recurso_guid}/enviar`, { respuestas });
      setResultado(data);
      setPreguntas([]);
      setSegundosRestantes(null);
      try {
        window.localStorage.removeItem(claveBorrador);
      } catch {
        /* nada que limpiar */
      }
    } catch (fallo) {
      showAlert.error('No se pudo enviar', mensajeDeError(fallo));
    } finally {
      setEnviando(false);
    }
  };

  /** Cierra el intento y devuelve el control al visor del curso. */
  const cerrar = async () => {
    const aprobado = resultado?.aprobado ?? false;
    setResultado(null);
    setRespuestas({});
    onQuizStateChange?.(false);
    await cargarEstado();
    onFinish(aprobado);
  };

  /** Abandonar cuenta como intento: el servidor ya lo registró al abrirlo. */
  const abandonar = async () => {
    setConfirmarSalida(false);
    await enviarRespuestas();
  };

  // ── Vistas ─────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className="bg-card border border-border/50 rounded-[2.5rem] p-12 flex flex-col items-center justify-center min-h-[350px] animate-pulse">
        <div className="w-20 h-20 bg-muted/60 rounded-full mb-6" />
        <div className="h-8 w-64 bg-muted/60 rounded-2xl mb-4" />
        <div className="h-4 w-48 bg-muted/60 rounded-xl" />
      </div>
    );
  }

  if (error || !estado) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center border border-border/50 rounded-3xl bg-card">
        <AlertTriangle className="h-14 w-14 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">No se pudo abrir el cuestionario</h2>
        <p className="text-muted-foreground max-w-md">{error ?? 'Inténtalo de nuevo en unos minutos.'}</p>
      </div>
    );
  }

  if (estado.aprobado && !resultado && !enCurso) {
    return (
      <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-950/20 flex flex-col items-center justify-center p-12 text-center border border-emerald-500/30 rounded-[2rem]">
        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <Trophy className="h-12 w-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black mb-3 tracking-tight">Cuestionario aprobado</h2>
        <p className="text-muted-foreground mb-8 text-lg max-w-sm">
          Lo superaste con{' '}
          <strong className="text-emerald-500">
            {formatearPuntos(estado.mejor_nota)} / {NOTA_MAXIMA}
          </strong>
          .
        </p>
        <span className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-2 rounded-full text-emerald-600 font-bold text-sm">
          Módulo completado
        </span>
      </div>
    );
  }

  const respondidas = Object.keys(respuestas).length;
  const porcentajeRespondido = preguntas.length > 0 ? (respondidas / preguntas.length) * 100 : 0;

  return (
    <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm relative">
      {enCurso && (
        <div className="bg-background/80 backdrop-blur-md border-b border-border/50 p-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setConfirmarSalida(true)}
              className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors"
              title="Salir del cuestionario"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <span className="font-bold text-sm truncate max-w-[150px] md:max-w-none">{bloque_titulo}</span>
          </div>

          <div className="flex items-center gap-4">
            {segundosRestantes !== null && (
              <span
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-xs border ${
                  segundosRestantes < 60
                    ? 'bg-red-500/20 text-red-500 border-red-500/50 animate-pulse'
                    : 'bg-muted text-foreground border-border'
                }`}
              >
                <Clock className="h-3 w-3" />
                {formatearTiempo(segundosRestantes)}
              </span>
            )}
            <span className="text-xs font-bold text-muted-foreground hidden sm:block">
              {respondidas} / {preguntas.length}
            </span>
          </div>

          <div
            className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-500"
            style={{ width: `${porcentajeRespondido}%` }}
          />
        </div>
      )}

      {!enCurso ? (
        <div>
          <div className="p-6 md:p-10 border-b border-border bg-amber-500/10">
            <h3 className="font-bold text-xs text-amber-700 dark:text-amber-500 uppercase tracking-widest mb-4">
              Instrucciones
            </h3>
            <div
              className="prose prose-slate dark:prose-invert max-w-none text-foreground"
              dangerouslySetInnerHTML={sanitizeHTML(
                instrucciones_html || '<p class="text-muted-foreground italic">Sin instrucciones específicas.</p>',
              )}
            />

            {(url_referencia || archivo_adjunto_url) && (
              <div className="mt-8 space-y-3">
                {url_referencia && (
                  <a
                    href={normalizarEnlace(url_referencia)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-background/50 border border-primary/20 rounded-2xl text-sm text-primary font-bold hover:bg-primary/5 transition-all"
                  >
                    <ExternalLink className="h-5 w-5" />
                    <span className="truncate">{url_referencia}</span>
                  </a>
                )}
                {archivo_adjunto_url && (
                  <a
                    href={urlDeArchivo(archivo_adjunto_url) ?? ''}
                    className="flex items-center gap-4 p-4 bg-background/50 border border-border rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all"
                  >
                    <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Paperclip className="h-5 w-5 text-primary" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-black block truncate">
                        {archivo_adjunto_nombre || 'Material de apoyo'}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Recurso de apoyo</span>
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="p-10 text-center relative overflow-hidden">
            <div className="relative z-10 py-4">
              <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-amber-500" />
              </div>

              <h2 className="text-2xl font-black mb-6 uppercase tracking-widest">Información de la evaluación</h2>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-2xl mx-auto mb-10">
                <Dato
                  icono={Clock}
                  color="text-amber-500"
                  valor={estado.tiempo_minutos > 0 ? `${estado.tiempo_minutos} min` : 'Sin límite'}
                  etiqueta="Tiempo"
                />
                <Dato
                  icono={Trophy}
                  color="text-emerald-500"
                  valor={`${formatearPuntos(estado.nota_aprobacion)} pts`}
                  etiqueta="Para aprobar"
                />
                <Dato
                  icono={Send}
                  color="text-blue-500"
                  valor={
                    estado.max_intentos > 0
                      ? `${estado.intentos_realizados} / ${estado.max_intentos}`
                      : String(estado.intentos_realizados)
                  }
                  etiqueta="Intentos usados"
                />
                <Dato
                  icono={CheckCircle}
                  color="text-primary"
                  valor={estado.mejor_nota === null ? '—' : formatearPuntos(estado.mejor_nota)}
                  etiqueta="Mejor nota"
                />
              </div>

              {estado.motivo_bloqueo ? (
                <p className="mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-4 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {estado.motivo_bloqueo}
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-8 text-sm max-w-md mx-auto italic">
                    Al comenzar se registra el intento y, si hay límite, el tiempo empieza a correr.
                  </p>
                  <button
                    onClick={iniciarIntento}
                    disabled={iniciando}
                    className="text-xl px-16 py-5 rounded-[1.5rem] font-black bg-amber-500 hover:bg-amber-600 text-white shadow-2xl shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {iniciando ? 'Preparando…' : 'Comenzar intento'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 md:p-12 space-y-8">
          {preguntas.map((pregunta, indice) => (
            <fieldset
              key={pregunta.id}
              className="bg-background border border-border/60 rounded-[2rem] p-6 md:p-10 relative overflow-hidden"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/20" aria-hidden="true" />

              <legend className="sr-only">Pregunta {indice + 1}</legend>
              <h3 className="font-bold text-xl md:text-2xl mb-8 flex gap-5 leading-relaxed">
                <span className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-lg font-black">
                  {indice + 1}
                </span>
                <span className="mt-2">{pregunta.enunciado}</span>
              </h3>

              <div className="space-y-3 md:pl-16">
                {pregunta.opciones.map((opcion) => {
                  const elegida = respuestas[pregunta.id] === opcion.id;
                  return (
                    <label
                      key={opcion.id}
                      className={`flex items-center gap-4 md:gap-5 p-5 md:p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                        elegida
                          ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5'
                          : 'bg-background border-border hover:border-primary/30 hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={pregunta.id}
                        checked={elegida}
                        onChange={() => setRespuestas((previas) => ({ ...previas, [pregunta.id]: opcion.id }))}
                        className="sr-only"
                      />
                      <span
                        className={`w-6 h-6 md:w-7 md:h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          elegida ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`w-3 h-3 md:w-3.5 md:h-3.5 bg-primary rounded-full transition-transform ${
                            elegida ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </span>
                      <span className={`text-base md:text-lg ${elegida ? 'font-black' : 'text-muted-foreground font-semibold'}`}>
                        {opcion.texto}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex justify-center pt-10 pb-10">
            <button
              onClick={() => setConfirmarEnvio(true)}
              disabled={enviando}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-12 py-5 rounded-[1.5rem] font-black shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-4 text-xl disabled:opacity-60"
            >
              <Send className="h-6 w-6" />
              {enviando ? 'Enviando…' : 'Finalizar y enviar'}
            </button>
          </div>
        </div>
      )}

      {confirmarEnvio && (
        <Dialogo
          icono={AlertTriangle}
          tono="amber"
          titulo="¿Terminar el intento?"
          descripcion="Revisa el resumen antes de enviar."
          accionPrincipal={{ etiqueta: enviando ? 'Enviando…' : 'Confirmar envío', onClick: enviarRespuestas }}
          accionSecundaria={{ etiqueta: 'Volver', onClick: () => setConfirmarEnvio(false) }}
        >
          <div className="bg-muted/50 rounded-[1.5rem] p-6 space-y-3 text-base border border-border/50">
            <Fila etiqueta="Total de preguntas" valor={preguntas.length} />
            <Fila etiqueta="Respondidas" valor={respondidas} tono="text-emerald-600" />
            <Fila etiqueta="Sin responder" valor={preguntas.length - respondidas} tono="text-amber-600" />
          </div>
        </Dialogo>
      )}

      {confirmarSalida && (
        <Dialogo
          icono={XCircle}
          tono="red"
          titulo="¿Abandonar el intento?"
          descripcion="Se enviará tal y como está y contará como un intento realizado."
          accionPrincipal={{ etiqueta: 'Sí, salir', onClick: abandonar, destructiva: true }}
          accionSecundaria={{ etiqueta: 'No, continuar', onClick: () => setConfirmarSalida(false) }}
        />
      )}

      {resultado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl">
          <div className="bg-card border border-border shadow-2xl rounded-[3rem] w-full max-w-sm p-10 text-center">
            <div
              className={`w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-8 border ${
                resultado.aprobado
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}
            >
              {resultado.aprobado ? <Trophy className="h-14 w-14" /> : <XCircle className="h-14 w-14" />}
            </div>

            <p className="font-black text-6xl mb-4 tracking-tighter">
              {formatearPuntos(resultado.nota)}
              <span className="text-2xl text-muted-foreground font-bold tracking-normal"> / {NOTA_MAXIMA}</span>
            </p>
            <p
              className={`font-black text-xl mb-4 uppercase tracking-widest ${
                resultado.aprobado ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {resultado.aprobado ? 'Aprobado' : 'No aprobado'}
            </p>

            {resultado.fuera_de_tiempo && (
              <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                Se agotó el tiempo disponible, por eso el intento se calificó con 0.
              </p>
            )}

            <div className="bg-muted/50 rounded-[2rem] p-6 mb-8 text-sm flex justify-around border border-border/50">
              <div>
                <p className="font-black text-3xl">{resultado.correctas}</p>
                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">Aciertos</p>
              </div>
              <span className="w-px bg-border/50" />
              <div>
                <p className="font-black text-3xl">{resultado.total - resultado.correctas}</p>
                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">Fallos</p>
              </div>
            </div>

            {!resultado.aprobado && (
              <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                Necesitas {formatearPuntos(estado.nota_aprobacion)} puntos. Repasa el módulo y vuelve a intentarlo.
              </p>
            )}

            <button
              onClick={cerrar}
              className="w-full py-5 font-black text-xl rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95"
            >
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatearTiempo(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}:${String(resto).padStart(2, '0')}`;
}

/** Añade el esquema a un enlace escrito sin él, para que no se resuelva como ruta local. */
function normalizarEnlace(url: string): string {
  return /^https?:\/\//i.test(url) || url.startsWith('//') ? url : `https://${url}`;
}

function Dato({
  icono: Icono,
  color,
  valor,
  etiqueta,
}: {
  icono: typeof Clock;
  color: string;
  valor: string;
  etiqueta: string;
}) {
  return (
    <div className="bg-muted/30 p-5 rounded-[1.5rem] border border-border flex flex-col items-center">
      <Icono className={`h-6 w-6 mb-2 ${color}`} />
      <span className="text-lg font-black text-center">{valor}</span>
      <span className="text-[10px] text-muted-foreground uppercase font-black text-center">{etiqueta}</span>
    </div>
  );
}

function Fila({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: string }) {
  return (
    <div className={`flex justify-between items-center font-black ${tono ?? ''}`}>
      <span className={tono ? '' : 'font-bold text-muted-foreground'}>{etiqueta}:</span>
      <span>{valor}</span>
    </div>
  );
}

function Dialogo({
  icono: Icono,
  tono,
  titulo,
  descripcion,
  accionPrincipal,
  accionSecundaria,
  children,
}: {
  icono: typeof AlertTriangle;
  tono: 'amber' | 'red';
  titulo: string;
  descripcion: string;
  accionPrincipal: { etiqueta: string; onClick: () => void; destructiva?: boolean };
  accionSecundaria: { etiqueta: string; onClick: () => void };
  children?: React.ReactNode;
}) {
  const colores = tono === 'amber' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="bg-card border border-border shadow-2xl rounded-[2.5rem] w-full max-w-md p-8">
        <div className="flex items-center gap-5 mb-6">
          <span className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${colores}`}>
            <Icono className="h-7 w-7" />
          </span>
          <div>
            <h3 className="font-black text-2xl tracking-tight">{titulo}</h3>
            <p className="text-sm text-muted-foreground font-bold mt-1">{descripcion}</p>
          </div>
        </div>

        {children && <div className="mb-8">{children}</div>}

        <div className="flex gap-3">
          <button
            onClick={accionSecundaria.onClick}
            className="flex-1 py-4 bg-muted hover:bg-muted/80 font-black rounded-2xl transition-all"
          >
            {accionSecundaria.etiqueta}
          </button>
          <button
            onClick={accionPrincipal.onClick}
            className={`flex-[2] py-4 font-black rounded-2xl shadow-lg transition-all ${
              accionPrincipal.destructiva
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {accionPrincipal.etiqueta}
          </button>
        </div>
      </div>
    </div>
  );
}
