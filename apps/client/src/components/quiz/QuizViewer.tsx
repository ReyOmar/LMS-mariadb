'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import api, { errorMessage, fileUrlFor } from '@/lib/api';
import { formatPoints, MAX_SCORE } from '@/lib/grading';
import { useAlerts } from '@/contexts/AlertContext';
import { useDialog } from '@/hooks/useDialog';
import { sanitizeHTML } from '@/lib/sanitize';
import { externalUrl } from '@/lib/resources';
import type { QuizState, QuizQuestion } from '@/types/models';
import { clearQuizDraft, readQuizDraft, saveQuizDraft, type QuizAnswers } from './quiz-draft';

/**
 * Realización de un cuestionario.
 *
 * Las preguntas **no llegan con la ficha del curso**: se piden al abrir el intento, y el
 * servidor las devuelve sin la marca de cuál es la opción correcta, para que las respuestas
 * no estén en el navegador del alumno antes de empezar el examen.
 *
 * La corrección también ocurre sólo en el servidor: aquí no hay forma de calcular la nota.
 */

interface Result {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  outOfTime: boolean;
}

/** Intento abierto: sus preguntas y cuándo empezó a correr el tiempo, según el servidor. */
interface StartedAttempt {
  startedAt: string;
  timeLimitMinutes: number;
  questions: QuizQuestion[];
}

interface QuizViewerProps {
  resourceGuid: string;
  resourceTitle: string;
  instructionsHtml?: string;
  referenceUrl?: string | null;
  /** URL firmada del material de apoyo, tal y como la devuelve la API. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  /** Se invoca al cerrar el intento; `passed` decide si el curso puede continuar. */
  onFinish: (passed: boolean) => void;
  onQuizStateChange?: (inProgress: boolean) => void;
}

export default function QuizViewer({
  resourceGuid,
  resourceTitle,
  instructionsHtml,
  referenceUrl,
  attachmentUrl,
  attachmentName,
  onFinish,
  onQuizStateChange,
}: QuizViewerProps) {
  const { showAlert } = useAlerts();

  const [status, setStatus] = useState<QuizState | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const inProgress = questions.length > 0 && !result;

  // ── Carga ──────────────────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<QuizState>(`/courses/quiz/${resourceGuid}/status`);
      setStatus(data);
      return data;
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo cargar el cuestionario.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [resourceGuid]);

  useEffect(() => {
    void loadState().then((data) => {
      if (!data) return;
      // Si quedó un intento abierto (recarga, cierre accidental), se retoma solo. Si no,
      // cualquier borrador guardado es de un intento que ya terminó.
      if (data.attemptInProgress) void resumeAttempt(data);
      else clearQuizDraft(resourceGuid);
    });
    // Sólo al abrir el cuestionario: `resumeAttempt` no depende de nada que no cubra ya
    // `loadState`, y repetirlo en cada render reabriría el intento una y otra vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  /** Abre el intento o, si ya había uno, lo devuelve tal cual: mismas preguntas y mismo inicio. */
  const requestAttempt = () => api.post<StartedAttempt>(`/courses/quiz/${resourceGuid}/start`);

  /** Recupera un intento ya abierto: mismas preguntas y el cronómetro donde iba. */
  const resumeAttempt = async (state: QuizState) => {
    try {
      const { data } = await requestAttempt();
      setQuestions(data.questions);
      onQuizStateChange?.(true);
      const saved = readQuizDraft(resourceGuid);
      if (saved) setAnswers(saved);
      adjustTimer(data.startedAt, data.timeLimitMinutes || state.timeLimitMinutes);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo retomar el intento.'));
    }
  };

  /** Calcula el tiempo que queda a partir del inicio real registrado en el servidor. */
  const adjustTimer = (start: string | null, minutes: number) => {
    if (!start || minutes <= 0) {
      setRemainingSeconds(null);
      return;
    }
    const elapsedSeconds = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
    setRemainingSeconds(Math.max(0, minutes * 60 - elapsedSeconds));
  };

  // Las respuestas se guardan localmente por si la pestaña se cierra a mitad del examen.
  useEffect(() => {
    if (!inProgress || Object.keys(answers).length === 0) return;
    saveQuizDraft(resourceGuid, answers);
  }, [answers, inProgress, resourceGuid]);

  // ── Cronómetro ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!inProgress || remainingSeconds === null) return;

    if (remainingSeconds <= 0) {
      void submitAnswers();
      return;
    }

    const timer = setTimeout(() => setRemainingSeconds((value) => (value ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
    // El efecto se renueva cada segundo, así que `submitAnswers` es siempre la del último
    // render. Como dependencia, cada respuesta marcada reiniciaría el segundo en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, inProgress]);

  // ── Acciones ───────────────────────────────────────────────────────────

  const startAttempt = async () => {
    setStarting(true);
    setError(null);
    try {
      const { data } = await requestAttempt();
      setQuestions(data.questions);
      setAnswers({});
      clearQuizDraft(resourceGuid);
      adjustTimer(data.startedAt, data.timeLimitMinutes);
      onQuizStateChange?.(true);
    } catch (failure) {
      showAlert.error('No se pudo comenzar', errorMessage(failure));
    } finally {
      setStarting(false);
    }
  };

  const submitAnswers = async () => {
    if (submitting) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      const { data } = await api.post<Result>(`/courses/quiz/${resourceGuid}/submit`, { answers });
      setResult(data);
      setQuestions([]);
      setRemainingSeconds(null);
      clearQuizDraft(resourceGuid);
    } catch (failure) {
      showAlert.error('No se pudo enviar', errorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  };

  /** Cierra el intento y devuelve el control al visor del curso. */
  const close = async () => {
    const passed = result?.passed ?? false;
    setResult(null);
    setAnswers({});
    onQuizStateChange?.(false);
    await loadState();
    onFinish(passed);
  };

  /** Abandonar cuenta como intento: el servidor ya lo registró al abrirlo. */
  const abandon = async () => {
    setConfirmExit(false);
    await submitAnswers();
  };

  const resultDialog = useDialog({ open: result !== null, onClose: close, label: 'Resultado del cuestionario' });

  // ── Vistas ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-card border border-border/50 rounded-[2.5rem] p-12 flex flex-col items-center justify-center min-h-[350px] animate-pulse">
        <div className="w-20 h-20 bg-muted/60 rounded-full mb-6" />
        <div className="h-8 w-64 bg-muted/60 rounded-2xl mb-4" />
        <div className="h-4 w-48 bg-muted/60 rounded-xl" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center border border-border/50 rounded-3xl bg-card">
        <AlertTriangle className="h-14 w-14 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">No se pudo abrir el cuestionario</h2>
        <p className="text-muted-foreground max-w-md">{error ?? 'Inténtalo de nuevo en unos minutos.'}</p>
      </div>
    );
  }

  if (status.passed && !result && !inProgress) {
    return (
      <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-950/20 flex flex-col items-center justify-center p-12 text-center border border-emerald-500/30 rounded-[2rem]">
        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <Trophy className="h-12 w-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black mb-3 tracking-tight">Cuestionario aprobado</h2>
        <p className="text-muted-foreground text-lg max-w-sm">
          Lo superaste con{' '}
          <strong className="text-emerald-700 dark:text-emerald-400">
            {formatPoints(status.bestScore)} / {MAX_SCORE}
          </strong>
          .
        </p>
      </div>
    );
  }

  const answered = Object.keys(answers).length;
  const answeredPercent = questions.length > 0 ? (answered / questions.length) * 100 : 0;

  return (
    <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm relative">
      {inProgress && (
        <div className="bg-background/80 backdrop-blur-md border-b border-border/50 p-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setConfirmExit(true)}
              className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors"
              title="Salir del cuestionario"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <span className="font-bold text-sm truncate max-w-[150px] md:max-w-none">{resourceTitle}</span>
          </div>

          <div className="flex items-center gap-4">
            {remainingSeconds !== null && (
              <span
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-xs border ${
                  remainingSeconds < 60
                    ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50 animate-pulse'
                    : 'bg-muted text-foreground border-border'
                }`}
              >
                <Clock className="h-3 w-3" />
                {formatTime(remainingSeconds)}
              </span>
            )}
            <span className="text-xs font-bold text-muted-foreground hidden sm:block">
              {answered} / {questions.length}
            </span>
          </div>

          <div
            className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-500"
            style={{ width: `${answeredPercent}%` }}
          />
        </div>
      )}

      {!inProgress ? (
        <div>
          <div className="p-6 md:p-10 border-b border-border bg-amber-500/10">
            <h3 className="font-bold text-xs text-amber-700 dark:text-amber-500 uppercase tracking-widest mb-4">
              Instrucciones
            </h3>
            <div
              className="prose prose-slate dark:prose-invert max-w-none text-foreground"
              dangerouslySetInnerHTML={sanitizeHTML(
                instructionsHtml || '<p class="text-muted-foreground italic">Sin instrucciones específicas.</p>',
              )}
            />

            {(referenceUrl || attachmentUrl) && (
              <div className="mt-8 space-y-3">
                {referenceUrl && (
                  <a
                    href={externalUrl(referenceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-background/50 border border-primary/20 rounded-2xl text-sm text-primary font-bold hover:bg-primary/5 transition-all"
                  >
                    <ExternalLink className="h-5 w-5" />
                    <span className="truncate">{referenceUrl}</span>
                  </a>
                )}
                {attachmentUrl && (
                  <a
                    href={fileUrlFor(attachmentUrl) ?? ''}
                    className="flex items-center gap-4 p-4 bg-background/50 border border-border rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all"
                  >
                    <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Paperclip className="h-5 w-5 text-primary" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-black block truncate">{attachmentName || 'Material de apoyo'}</span>
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
                <Field
                  icon={Clock}
                  color="text-amber-500"
                  value={status.timeLimitMinutes > 0 ? `${status.timeLimitMinutes} min` : 'Sin límite'}
                  label="Tiempo"
                />
                <Field
                  icon={Trophy}
                  color="text-emerald-500"
                  value={`${formatPoints(status.passingScore)} pts`}
                  label="Para aprobar"
                />
                <Field
                  icon={Send}
                  color="text-blue-500"
                  value={
                    status.maxAttempts > 0
                      ? `${status.attemptsMade} / ${status.maxAttempts}`
                      : String(status.attemptsMade)
                  }
                  label="Intentos usados"
                />
                <Field
                  icon={CheckCircle}
                  color="text-primary"
                  value={status.bestScore === null ? '—' : formatPoints(status.bestScore)}
                  label="Mejor nota"
                />
              </div>

              {status.blockedReason ? (
                <p className="mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-4 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {status.blockedReason}
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground mb-8 text-sm max-w-md mx-auto italic">
                    Al comenzar se registra el intento y, si hay límite, el tiempo empieza a correr.
                  </p>
                  <button
                    onClick={startAttempt}
                    disabled={starting}
                    className="text-xl px-16 py-5 rounded-[1.5rem] font-black bg-amber-500 hover:bg-amber-600 text-amber-950 shadow-2xl shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {starting ? 'Preparando…' : 'Comenzar intento'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 md:p-12 space-y-8">
          {questions.map((question, index) => (
            <fieldset
              key={question.id}
              className="bg-background border border-border/60 rounded-[2rem] p-6 md:p-10 relative overflow-hidden"
            >
              <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/20" aria-hidden="true" />

              <legend className="sr-only">Pregunta {index + 1}</legend>
              <h3 className="font-bold text-xl md:text-2xl mb-8 flex gap-5 leading-relaxed">
                <span className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-lg font-black">
                  {index + 1}
                </span>
                <span className="mt-2">{question.prompt}</span>
              </h3>

              <div className="space-y-3 md:pl-16">
                {question.options.map((option) => {
                  const chosen = answers[question.id] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex items-center gap-4 md:gap-5 p-5 md:p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                        chosen
                          ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5'
                          : 'bg-background border-border hover:border-primary/30 hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={chosen}
                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                        className="sr-only"
                      />
                      <span
                        className={`w-6 h-6 md:w-7 md:h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          chosen ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`w-3 h-3 md:w-3.5 md:h-3.5 bg-primary rounded-full transition-transform ${
                            chosen ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </span>
                      <span
                        className={`text-base md:text-lg ${chosen ? 'font-black' : 'text-muted-foreground font-semibold'}`}
                      >
                        {option.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex justify-center pt-10 pb-10">
            <button
              onClick={() => setConfirmSubmit(true)}
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-12 py-5 rounded-[1.5rem] font-black shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-4 text-xl disabled:opacity-60"
            >
              <Send className="h-6 w-6" />
              {submitting ? 'Enviando…' : 'Finalizar y enviar'}
            </button>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <Dialog
          icon={AlertTriangle}
          tone="amber"
          title="¿Terminar el intento?"
          description="Revisa el resumen antes de enviar."
          primaryAction={{ label: submitting ? 'Enviando…' : 'Confirmar envío', onClick: submitAnswers }}
          secondaryAction={{ label: 'Volver', onClick: () => setConfirmSubmit(false) }}
        >
          <div className="bg-muted/50 rounded-[1.5rem] p-6 space-y-3 text-base border border-border/50">
            <Row label="Total de preguntas" value={questions.length} />
            <Row label="Respondidas" value={answered} tone="text-emerald-700 dark:text-emerald-400" />
            <Row label="Sin responder" value={questions.length - answered} tone="text-amber-700 dark:text-amber-400" />
          </div>
        </Dialog>
      )}

      {confirmExit && (
        <Dialog
          icon={XCircle}
          tone="red"
          title="¿Abandonar el intento?"
          description="Se enviará tal y como está y contará como un intento realizado."
          primaryAction={{ label: 'Sí, salir', onClick: abandon, destructive: true }}
          secondaryAction={{ label: 'No, continuar', onClick: () => setConfirmExit(false) }}
        />
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl">
          <div
            {...resultDialog.dialogProps}
            className="bg-card border border-border shadow-2xl rounded-[3rem] w-full max-w-sm p-10 text-center"
          >
            <div
              className={`w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-8 border ${
                result.passed
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}
            >
              {result.passed ? <Trophy className="h-14 w-14" /> : <XCircle className="h-14 w-14" />}
            </div>

            <p className="font-black text-6xl mb-4 tracking-tighter">
              {formatPoints(result.score)}
              <span className="text-2xl text-muted-foreground font-bold tracking-normal"> / {MAX_SCORE}</span>
            </p>
            <p
              className={`font-black text-xl mb-4 uppercase tracking-widest ${
                result.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
              }`}
            >
              {result.passed ? 'Aprobado' : 'No aprobado'}
            </p>

            {result.outOfTime && (
              <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                Se agotó el tiempo disponible, por eso el intento se calificó con 0.
              </p>
            )}

            <div className="bg-muted/50 rounded-[2rem] p-6 mb-8 text-sm flex justify-around border border-border/50">
              <div>
                <p className="font-black text-3xl">{result.correct}</p>
                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">Aciertos</p>
              </div>
              <span className="w-px bg-border/50" />
              <div>
                <p className="font-black text-3xl">{result.total - result.correct}</p>
                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">Fallos</p>
              </div>
            </div>

            {!result.passed && (
              <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                Necesitas {formatPoints(status.passingScore)} puntos. Repasa el módulo y vuelve a intentarlo.
              </p>
            )}

            <button
              onClick={close}
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

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function Field({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: typeof Clock;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-muted/30 p-5 rounded-[1.5rem] border border-border flex flex-col items-center">
      <Icon className={`h-6 w-6 mb-2 ${color}`} />
      <span className="text-lg font-black text-center">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase font-black text-center">{label}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`flex justify-between items-center font-black ${tone ?? ''}`}>
      <span className={tone ? '' : 'font-bold text-muted-foreground'}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function Dialog({
  icon: Icon,
  tone,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: 'amber' | 'red';
  title: string;
  description: string;
  primaryAction: { label: string; onClick: () => void; destructive?: boolean };
  secondaryAction: { label: string; onClick: () => void };
  children?: ReactNode;
}) {
  const colors = tone === 'amber' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500';
  // Escape equivale a la acción secundaria («Volver», «No, continuar»): no envía nada.
  const { dialogProps, titleId } = useDialog({ onClose: secondaryAction.onClick });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div {...dialogProps} className="bg-card border border-border shadow-2xl rounded-[2.5rem] w-full max-w-md p-8">
        <div className="flex items-center gap-5 mb-6">
          <span className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${colors}`}>
            <Icon className="h-7 w-7" />
          </span>
          <div>
            <h3 id={titleId} className="font-black text-2xl tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground font-bold mt-1">{description}</p>
          </div>
        </div>

        {children && <div className="mb-8">{children}</div>}

        <div className="flex gap-3">
          <button
            onClick={secondaryAction.onClick}
            className="flex-1 py-4 bg-muted hover:bg-muted/80 font-black rounded-2xl transition-all"
          >
            {secondaryAction.label}
          </button>
          <button
            onClick={primaryAction.onClick}
            className={`flex-[2] py-4 font-black rounded-2xl shadow-lg transition-all ${
              primaryAction.destructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
