'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Trophy, XCircle, type LucideIcon } from 'lucide-react';
import { MAX_SCORE } from '@/lib/grading';
import { useDialog } from '@/hooks/useDialog';

/** Nota del intento, tal y como la calcula el servidor. */
export interface QuizResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  outOfTime: boolean;
}

/** Confirma la entrega con el resumen de lo respondido. */
export function SubmitDialog({
  total,
  answered,
  submitting,
  onConfirm,
  onCancel,
}: {
  total: number;
  answered: number;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      icon={AlertTriangle}
      tone="amber"
      title="¿Terminar el intento?"
      description="Revisa el resumen antes de enviar."
      primaryAction={{ label: submitting ? 'Enviando…' : 'Confirmar envío', onClick: onConfirm }}
      secondaryAction={{ label: 'Volver', onClick: onCancel }}
    >
      <div className="bg-muted/50 rounded-[1.5rem] p-6 space-y-3 text-base border border-border/50">
        <Row label="Total de preguntas" value={total} />
        <Row label="Respondidas" value={answered} tone="text-emerald-700 dark:text-emerald-400" />
        <Row label="Sin responder" value={total - answered} tone="text-amber-700 dark:text-amber-400" />
      </div>
    </ConfirmDialog>
  );
}

/** Confirma la salida a mitad del intento, que se entrega tal y como esté. */
export function ExitDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      icon={XCircle}
      tone="red"
      title="¿Abandonar el intento?"
      description="Se enviará tal y como está y contará como un intento realizado."
      primaryAction={{ label: 'Sí, salir', onClick: onConfirm, destructive: true }}
      secondaryAction={{ label: 'No, continuar', onClick: onCancel }}
    />
  );
}

/** La nota del intento recién entregado. Al cerrarla, el curso decide si puede continuar. */
export function ResultDialog({
  result,
  passingScore,
  points,
  onClose,
}: {
  result: QuizResult;
  passingScore: number;
  /** Una nota con el formato de la sede. */
  points: (score: unknown) => string;
  onClose: () => void;
}) {
  const { dialogProps } = useDialog({ onClose, label: 'Resultado del cuestionario' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl">
      <div
        {...dialogProps}
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
          {points(result.score)}
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
            Necesitas {points(passingScore)} puntos. Repasa el módulo y vuelve a intentarlo.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full py-5 font-black text-xl rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/30 transition-all hover:scale-105 active:scale-95"
        >
          Continuar
        </button>
      </div>
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

function ConfirmDialog({
  icon: Icon,
  tone,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
}: {
  icon: LucideIcon;
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
