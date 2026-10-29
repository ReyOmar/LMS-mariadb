'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Trophy } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { MAX_SCORE, formatScoreValue } from '@/lib/grading';
import { useAlerts } from '@/contexts/AlertContext';
import { useCountry } from '@/contexts/CountryContext';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import type { QuizState, QuizQuestion } from '@/types/models';
import { clearQuizDraft, readQuizDraft, saveQuizDraft, type QuizAnswers } from './quiz-draft';
import { QuizIntro } from './QuizIntro';
import { AttemptBar, AttemptQuestions } from './QuizAttempt';
import { ExitDialog, ResultDialog, SubmitDialog, type QuizResult } from './QuizDialogs';

/**
 * Realización de un cuestionario.
 *
 * Las preguntas **no llegan con la ficha del curso**: se piden al abrir el intento, y el
 * servidor las devuelve sin la marca de cuál es la opción correcta, para que las respuestas
 * no estén en el navegador del alumno antes de empezar el examen.
 *
 * La corrección también ocurre sólo en el servidor: aquí no hay forma de calcular la nota.
 */

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
  /**
   * Recibe los rechazos de la API para que el curso decida si el alumno sigue teniendo
   * acceso (baja, mantenimiento). Devuelve si se ha hecho cargo; si no, avisa el visor.
   */
  onAccessError?: (error: unknown, title: string) => boolean;
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
  onAccessError,
}: QuizViewerProps) {
  const { showAlert } = useAlerts();
  const { country } = useCountry();

  // Se lee desde la carga inicial, que no debe repetirse porque el curso cambie la función.
  const onAccessErrorRef = useRef(onAccessError);
  onAccessErrorRef.current = onAccessError;

  /** Avisa de un error, salvo que sea de acceso: de eso se encarga el curso. */
  const report = (title: string, failure: unknown) => {
    if (!onAccessErrorRef.current?.(failure, title)) showAlert.error(title, errorMessage(failure));
  };

  const points = (score: unknown) => formatScoreValue(score, country);

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
  const [result, setResult] = useState<QuizResult | null>(null);

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
      if (!onAccessErrorRef.current?.(failure, 'No se pudo abrir el cuestionario')) {
        setError(errorMessage(failure, 'No se pudo cargar el cuestionario.'));
      }
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

  // El examinador puede conceder otro intento mientras el alumno mira el «has agotado tus
  // intentos», y el aviso se pierde si el tiempo real estaba cortado. Con un intento o su
  // resultado en pantalla no se recarga: se taparían con el indicador de carga.
  const refreshIdleState = () => {
    if (!inProgress && !result) void loadState();
  };
  useRealtimeEvent('quiz:attempt-enabled', (data) => {
    if ((data as { resourceGuid?: string })?.resourceGuid === resourceGuid) refreshIdleState();
  });
  useRealtimeReconnect(refreshIdleState);

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
      if (!onAccessErrorRef.current?.(failure, 'No se pudo retomar el intento')) {
        setError(errorMessage(failure, 'No se pudo retomar el intento.'));
      }
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
      report('No se pudo comenzar', failure);
    } finally {
      setStarting(false);
    }
  };

  const submitAnswers = async () => {
    if (submitting) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      const { data } = await api.post<QuizResult>(`/courses/quiz/${resourceGuid}/submit`, { answers });
      setResult(data);
      setQuestions([]);
      setRemainingSeconds(null);
      clearQuizDraft(resourceGuid);
    } catch (failure) {
      report('No se pudo enviar', failure);
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
            {points(status.bestScore)} / {MAX_SCORE}
          </strong>
          .
        </p>
      </div>
    );
  }

  const answered = Object.keys(answers).length;

  return (
    <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm relative">
      {inProgress ? (
        <>
          <AttemptBar
            title={resourceTitle}
            remainingSeconds={remainingSeconds}
            answered={answered}
            total={questions.length}
            onExit={() => setConfirmExit(true)}
          />
          <AttemptQuestions
            questions={questions}
            answers={answers}
            onAnswer={(questionId, optionId) => setAnswers((prev) => ({ ...prev, [questionId]: optionId }))}
            submitting={submitting}
            onSubmit={() => setConfirmSubmit(true)}
          />
        </>
      ) : (
        <QuizIntro
          status={status}
          instructionsHtml={instructionsHtml}
          referenceUrl={referenceUrl}
          attachmentUrl={attachmentUrl}
          attachmentName={attachmentName}
          points={points}
          starting={starting}
          onStart={startAttempt}
        />
      )}

      {confirmSubmit && (
        <SubmitDialog
          total={questions.length}
          answered={answered}
          submitting={submitting}
          onConfirm={submitAnswers}
          onCancel={() => setConfirmSubmit(false)}
        />
      )}
      {confirmExit && <ExitDialog onConfirm={abandon} onCancel={() => setConfirmExit(false)} />}
      {result && <ResultDialog result={result} passingScore={status.passingScore} points={points} onClose={close} />}
    </div>
  );
}
