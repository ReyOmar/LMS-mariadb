'use client';

import { CheckCircle, Clock, Send, Trophy, type LucideIcon } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { hasContent } from '@/lib/editor-html';
import { SupportMaterials } from '@/components/resources/SupportMaterials';
import type { QuizState } from '@/types/models';

interface Props {
  status: QuizState;
  instructionsHtml?: string;
  referenceUrl?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  /** Una nota con el formato de la sede. */
  points: (score: unknown) => string;
  starting: boolean;
  onStart: () => void;
}

/** Antes de empezar: las instrucciones, el material de apoyo, las condiciones y el botón para comenzar. */
export function QuizIntro({
  status,
  instructionsHtml,
  referenceUrl,
  attachmentUrl,
  attachmentName,
  points,
  starting,
  onStart,
}: Props) {
  return (
    <div>
      <div className="p-6 md:p-10 border-b border-border bg-amber-500/10">
        <h3 className="font-bold text-xs text-amber-700 dark:text-amber-500 uppercase tracking-widest mb-4">
          Instrucciones
        </h3>
        <div className="space-y-8">
          <div
            className="prose prose-slate dark:prose-invert max-w-none text-foreground"
            dangerouslySetInnerHTML={sanitizeHTML(
              hasContent(instructionsHtml)
                ? instructionsHtml
                : '<p class="text-muted-foreground italic">Sin instrucciones específicas.</p>',
            )}
          />
          <SupportMaterials referenceUrl={referenceUrl} attachmentUrl={attachmentUrl} attachmentName={attachmentName} />
        </div>
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
              value={`${points(status.passingScore)} pts`}
              label="Para aprobar"
            />
            <Field
              icon={Send}
              color="text-blue-500"
              value={
                status.maxAttempts > 0 ? `${status.attemptsMade} / ${status.maxAttempts}` : String(status.attemptsMade)
              }
              label="Intentos usados"
            />
            <Field icon={CheckCircle} color="text-primary" value={points(status.bestScore)} label="Mejor nota" />
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
                onClick={onStart}
                disabled={starting}
                className="text-lg md:text-xl px-10 md:px-16 py-5 whitespace-nowrap rounded-[1.5rem] font-black bg-amber-500 hover:bg-amber-600 text-amber-950 shadow-2xl shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
              >
                {starting ? 'Preparando…' : 'Comenzar intento'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, color, value, label }: { icon: LucideIcon; color: string; value: string; label: string }) {
  return (
    <div className="bg-muted/30 p-5 rounded-[1.5rem] border border-border flex flex-col items-center">
      <Icon className={`h-6 w-6 mb-2 ${color}`} />
      <span className="text-lg font-black text-center">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase font-black text-center">{label}</span>
    </div>
  );
}
