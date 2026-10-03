'use client';

import { useEffect, useRef, useState } from 'react';
import { BookCheck, Check, ChevronDown, Download, Edit3, FileText, Loader2, MessageSquare, Star } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { fileUrlFor } from '@/lib/api';
import { formatNumber } from '@/lib/country';
import { MAX_SCORE, MIN_SCORE } from '@/lib/grading';
import type { SubmissionToGrade } from '@/types/models';
import { gradingStart, isGraded, normalizeTypedScore, type ModuleWithAssignments } from './grouping';
import { dateTime } from '@/lib/dates';
import { initials, plural } from '@/lib/text';

interface Props {
  modules: ModuleWithAssignments[];
  /** Entrega abierta para calificar, o `null` si no hay ninguna. */
  grading: string | null;
  saving: boolean;
  onStart: (submission: SubmissionToGrade) => void;
  onCancel: () => void;
  onSave: (guid: string, score: number, feedback: string) => void;
}

/**
 * Entregas del curso, agrupadas en módulo → tarea → alumnos.
 *
 * Los dos niveles se pliegan porque un curso con varios módulos y decenas de alumnos no
 * cabe en una pantalla: el examinador abre el módulo en el que está trabajando y deja el
 * resto cerrado.
 */
export function SubmissionList({ modules, grading, saving, onStart, onCancel, onSave }: Props) {
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [openAssignments, setOpenAssignments] = useState<Record<string, boolean>>({});

  if (modules.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-lg font-bold">Sin resultados</h3>
        <p className="text-muted-foreground text-sm mt-1">
          No se encontraron entregas que coincidan con los filtros en este curso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {modules.map((module) => {
        const open = Boolean(openModules[module.key]);

        return (
          <div key={module.key} className="animate-in slide-in-from-bottom-2 duration-300">
            <div
              className={`bg-primary/5 rounded-t-2xl p-4 border border-primary/20 flex items-center gap-3 cursor-pointer select-none transition-colors hover:bg-primary/10 ${open ? '' : 'rounded-b-2xl'}`}
              onClick={() => setOpenModules((prev) => ({ ...prev, [module.key]: !open }))}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookCheck className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground flex-1 truncate">{module.moduleTitle}</h2>

              <div className="hidden sm:flex items-center gap-2">
                <Badge pending={module.pending} graded={module.graded} large />
              </div>

              <div className="p-2 bg-background/50 rounded-lg shrink-0">
                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                />
              </div>
            </div>

            {open && (
              <div className="border border-t-0 border-border rounded-b-2xl p-4 sm:p-6 bg-card space-y-6">
                {module.assignments.map((assignment) => {
                  const key = `${module.key}-${assignment.key}`;
                  const assignmentOpen = Boolean(openAssignments[key]);

                  return (
                    <div key={assignment.key} className="space-y-4">
                      <div
                        className="flex items-center gap-3 pb-2 border-b border-border/50 cursor-pointer select-none group"
                        onClick={() => setOpenAssignments((prev) => ({ ...prev, [key]: !assignmentOpen }))}
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
                          <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-foreground flex-1 truncate group-hover:text-primary transition-colors">
                          {assignment.assignmentTitle}
                        </h3>

                        <div className="flex items-center gap-2">
                          <Badge pending={assignment.pending} graded={assignment.graded} />
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${assignmentOpen ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>

                      {assignmentOpen && (
                        <div className="grid grid-cols-1 gap-4 pl-2 md:pl-4 border-l-2 border-border animate-in slide-in-from-top-1 duration-200">
                          {assignment.submissions.map((submission) => (
                            <SubmissionRow
                              key={submission.guid}
                              submission={submission}
                              beingGraded={grading === submission.guid}
                              saving={saving}
                              onStart={() => onStart(submission)}
                              onCancel={onCancel}
                              onSave={(score, feedback) => onSave(submission.guid, score, feedback)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ pending, graded, large = false }: { pending: number; graded: number; large?: boolean }) {
  const size = large ? 'text-xs px-3 py-1' : 'text-[10px] sm:text-xs px-2 py-0.5 sm:px-3 sm:py-1';

  if (pending > 0) {
    return (
      <span
        className={`bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold rounded-full flex items-center gap-1 ${size}`}
      >
        {large && <Star className="h-3 w-3" />} {pending} {plural(pending, 'pendiente', 'pendientes')}
      </span>
    );
  }

  if (graded > 0) {
    return (
      <span
        className={`bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold rounded-full flex items-center gap-1 ${size}`}
      >
        {large && <Check className="h-3 w-3" />} Al día
      </span>
    );
  }

  return large ? null : (
    <span className={`bg-muted text-muted-foreground font-bold rounded-full ${size}`}>Sin entregas</span>
  );
}

interface RowProps {
  submission: SubmissionToGrade;
  beingGraded: boolean;
  saving: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (score: number, feedback: string) => void;
}

function SubmissionRow({ submission, beingGraded, saving, onStart, onCancel, onSave }: RowProps) {
  const { country } = useCountry();
  const graded = isGraded(submission);
  const score = submission.score == null ? null : formatNumber(submission.score, country);
  // La API entrega una URL firmada, o `null` si el archivo se purgó al certificar.
  const downloadUrl = fileUrlFor(submission.fileUrl);
  const startButton = useRef<HTMLButtonElement>(null);
  const wasGrading = useRef(beingGraded);

  // Al cerrar el panel el foco se perdería con él: vuelve al botón que lo abrió, salvo que ya
  // esté en otro sitio (por ejemplo, en el panel de otra entrega).
  useEffect(() => {
    const closed = wasGrading.current && !beingGraded;
    wasGrading.current = beingGraded;
    if (closed && (!document.activeElement || document.activeElement === document.body)) {
      startButton.current?.focus();
    }
  }, [beingGraded]);

  return (
    <div
      className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all ${
        graded ? 'border-emerald-500/30' : 'border-border hover:border-primary/50'
      } ${beingGraded ? 'ring-2 ring-primary/50 shadow-md' : ''}`}
    >
      <div
        className={`p-5 flex flex-col md:flex-row md:items-center gap-4 ${beingGraded ? 'bg-muted/10 border-b border-border/50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
              graded
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
          >
            {initials(submission.student?.firstName, submission.student?.lastName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-bold text-base text-foreground truncate">
                {submission.student?.firstName} {submission.student?.lastName}
              </h4>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  graded
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                }`}
              >
                {graded ? 'Calificada' : 'Pendiente'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{dateTime(submission.submittedAt)}</p>
          </div>
        </div>

        {!beingGraded && (
          <div className="flex items-center gap-3 shrink-0">
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl text-xs font-bold transition-colors"
                title="Descargar entrega"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline max-w-[150px] truncate">{submission.fileName}</span>
              </a>
            )}

            {graded && score ? (
              <div className="flex items-center gap-2">
                <div className="bg-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{score}</span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">/ {MAX_SCORE}</span>
                </div>
                <button
                  ref={startButton}
                  type="button"
                  onClick={onStart}
                  className="p-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition-colors"
                  title="Editar calificación"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                ref={startButton}
                type="button"
                onClick={onStart}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 shadow-sm"
              >
                <Star className="h-4 w-4" /> Calificar
              </button>
            )}
          </div>
        )}
      </div>

      {beingGraded && (
        <GradingPanel
          submission={submission}
          downloadUrl={downloadUrl}
          saving={saving}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function GradingPanel({
  submission,
  downloadUrl,
  saving,
  onCancel,
  onSave,
}: {
  submission: SubmissionToGrade;
  downloadUrl: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (score: number, feedback: string) => void;
}) {
  const { country } = useCountry();
  const [start] = useState(() => gradingStart(submission));
  const [value, setValue] = useState(start.score);
  const [feedback, setFeedback] = useState(start.feedback);

  const score = Number.parseFloat(value);
  const valid = Number.isFinite(score) && score >= MIN_SCORE && score <= MAX_SCORE;

  return (
    <div
      className="p-6 bg-card/50 animate-in slide-in-from-top-2 duration-300"
      onKeyDown={(event) => {
        // Escape descarta la calificación sin guardar, como «Cancelar».
        if (event.key !== 'Escape' || saving) return;
        event.preventDefault();
        onCancel();
      }}
    >
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
            <Download className="h-4 w-4" /> Descargar {submission.fileName && `(${truncate(submission.fileName)})`}
          </a>
        ) : (
          <span className="text-sm font-medium text-muted-foreground italic">
            {submission.filePurged ? 'El archivo de esta entrega ya no está disponible.' : 'Sin archivo adjunto'}
          </span>
        )}
      </div>

      {start.previous && (
        <div className="mb-6 bg-muted/30 border border-border rounded-xl p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Calificación anterior
            {start.previous.score !== null && `: ${formatNumber(start.previous.score, country)} / ${MAX_SCORE}`}
          </p>
          {start.previous.feedback && (
            <p className="text-sm italic text-foreground/80 whitespace-pre-line">{start.previous.feedback}</p>
          )}
        </div>
      )}

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

function truncate(name: string): string {
  return name.length > 15 ? `${name.substring(0, 15)}...` : name;
}
