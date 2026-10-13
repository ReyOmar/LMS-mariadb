'use client';

import { useState } from 'react';
import { Check, Download, FileText, Loader2, MessageSquare } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { MAX_SCORE, MIN_SCORE } from '@/lib/grading';
import { shortLabel } from '../../components/summary-charts';
import type { ExaminerSubmission } from '../../types';
import { RetiredFile } from './RetiredFile';
import { gradingStart, normalizeTypedScore } from './grouping';

interface Props {
  submission: ExaminerSubmission;
  downloadUrl: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (score: number, feedback: string) => void;
}

/** Formulario de nota y comentario de una entrega, desplegado bajo su fila. */
export function GradingPanel({ submission, downloadUrl, saving, onCancel, onSave }: Props) {
  const [start] = useState(() => gradingStart(submission));
  const [value, setValue] = useState(start.score);
  const [feedback, setFeedback] = useState(start.feedback);

  const score = Number.parseFloat(value);
  const valid = Number.isFinite(score) && score >= MIN_SCORE && score <= MAX_SCORE;

  return (
    <div
      className="p-6 bg-card/50 animate-in slide-in-from-top-2 duration-300"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || saving) return;
        event.preventDefault();
        onCancel();
      }}
    >
      <SubmittedFile submission={submission} downloadUrl={downloadUrl} />
      {start.previous && <PreviousGrade previous={start.previous} />}

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-48 shrink-0">
          <label
            htmlFor={`score-${submission.guid}`}
            className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2"
          >
            Calificación ({MIN_SCORE} – {MAX_SCORE})
          </label>
          <div className="relative">
            <input
              id={`score-${submission.guid}`}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(normalizeTypedScore(e.target.value))}
              className="w-full bg-background border-2 border-border rounded-xl pl-4 pr-12 py-4 text-2xl font-black text-primary focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/20 transition-all"
              placeholder="0.0"
              autoFocus
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
              / {MAX_SCORE}
            </div>
          </div>
        </div>

        <div className="flex-1 w-full flex flex-col">
          <label
            htmlFor={`feedback-${submission.guid}`}
            className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Retroalimentación{' '}
            <span className="text-muted-foreground/50 lowercase">(opcional)</span>
          </label>
          <textarea
            id={`feedback-${submission.guid}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none min-h-[80px]"
            placeholder="Escribe un comentario o retroalimentación constructiva para el estudiante..."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-bold transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(score, feedback)}
          disabled={saving || !valid}
          className="flex items-center gap-2 px-8 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold transition-transform hover:-translate-y-0.5 shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar calificación
        </button>
      </div>
    </div>
  );
}

function SubmittedFile({ submission, downloadUrl }: { submission: ExaminerSubmission; downloadUrl: string | null }) {
  return (
    <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <div>
        <h5 className="text-sm font-bold text-primary flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4" /> Archivo enviado por el estudiante
        </h5>
        <p className="text-xs text-muted-foreground">Revisa el documento antes de asignar la calificación.</p>
      </div>

      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold transition-transform hover:-translate-y-0.5 shadow-md shrink-0"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download className="h-4 w-4" /> Descargar {submission.fileName && `(${shortLabel(submission.fileName)})`}
        </a>
      ) : submission.filePurged ? (
        <RetiredFile fileName={submission.fileName} />
      ) : (
        <span className="text-sm font-medium text-muted-foreground italic">Sin archivo adjunto</span>
      )}
    </div>
  );
}

function PreviousGrade({ previous }: { previous: { score: number | null; feedback: string | null } }) {
  const { country } = useCountry();
  return (
    <div className="mb-6 bg-muted/30 border border-border rounded-xl p-4">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
        Calificación anterior
        {previous.score !== null && `: ${formatNumber(previous.score, country)} / ${MAX_SCORE}`}
      </p>
      {previous.feedback && (
        <p className="text-sm italic text-foreground/80 whitespace-pre-line">{previous.feedback}</p>
      )}
    </div>
  );
}
