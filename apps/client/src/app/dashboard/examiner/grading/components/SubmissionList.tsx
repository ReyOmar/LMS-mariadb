'use client';

import { useEffect, useRef } from 'react';
import { BookCheck, Check, Download, Edit3, FileText, Lock, Star } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { fileUrlFor } from '@/lib/api';
import { formatNumber } from '@/lib/country';
import { MAX_SCORE } from '@/lib/grading';
import { dateTime } from '@/lib/dates';
import { initials, plural } from '@/lib/text';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityGroup, ModuleGroup, useExpandedGroups } from '../../components/GroupAccordion';
import type { ExaminerSubmission } from '../../types';
import { GradingPanel } from './GradingPanel';
import { RetiredFile } from './RetiredFile';
import { isGraded, type ModuleWithAssignments } from './grouping';

interface Props {
  modules: ModuleWithAssignments[];
  /** Entrega abierta para calificar, o `null` si no hay ninguna. */
  grading: string | null;
  saving: boolean;
  onStart: (guid: string) => void;
  onCancel: () => void;
  onSave: (guid: string, score: number, feedback: string) => void;
}

/** Entregas cargadas del curso, plegadas en módulo → tarea → alumnos. */
export function SubmissionList({ modules, grading, saving, onStart, onCancel, onSave }: Props) {
  const expandedModules = useExpandedGroups();
  const expandedAssignments = useExpandedGroups();

  if (modules.length === 0) {
    return (
      <EmptyState
        className="bg-card border border-dashed border-border rounded-2xl"
        icon={<FileText className="h-10 w-10" />}
        title="Sin resultados"
        description="No se encontraron entregas que coincidan con los filtros en este curso."
      />
    );
  }

  return (
    <div className="space-y-6">
      {modules.map((courseModule) => (
        <ModuleGroup
          key={courseModule.key}
          title={courseModule.moduleTitle}
          icon={<BookCheck className="h-5 w-5" />}
          aside={
            <span className="hidden sm:flex">
              <Badge pending={courseModule.pending} graded={courseModule.graded} large />
            </span>
          }
          open={expandedModules.isOpen(courseModule.key)}
          onToggle={() => expandedModules.toggle(courseModule.key)}
        >
          {courseModule.assignments.map((assignment) => {
            const key = `${courseModule.key}-${assignment.key}`;
            return (
              <ActivityGroup
                key={assignment.key}
                title={assignment.assignmentTitle}
                aside={<Badge pending={assignment.pending} graded={assignment.graded} />}
                open={expandedAssignments.isOpen(key)}
                onToggle={() => expandedAssignments.toggle(key)}
              >
                {assignment.submissions.map((submission) => (
                  <SubmissionRow
                    key={submission.guid}
                    submission={submission}
                    beingGraded={grading === submission.guid}
                    saving={saving}
                    onStart={() => onStart(submission.guid)}
                    onCancel={onCancel}
                    onSave={(score, feedback) => onSave(submission.guid, score, feedback)}
                  />
                ))}
              </ActivityGroup>
            );
          })}
        </ModuleGroup>
      ))}
    </div>
  );
}

function Badge({ pending, graded, large = false }: { pending: number; graded: number; large?: boolean }) {
  const { country } = useCountry();
  const size = large ? 'text-xs px-3 py-1' : 'text-[10px] sm:text-xs px-2 py-0.5 sm:px-3 sm:py-1';

  if (pending > 0) {
    return (
      <span
        className={`bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold rounded-full flex items-center gap-1 ${size}`}
      >
        {large && <Star className="h-3 w-3" />} {formatNumber(pending, country)}{' '}
        {plural(pending, 'pendiente', 'pendientes')}
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
  submission: ExaminerSubmission;
  beingGraded: boolean;
  saving: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (score: number, feedback: string) => void;
}

function SubmissionRow({ submission, beingGraded, saving, onStart, onCancel, onSave }: RowProps) {
  const graded = isGraded(submission);
  const startButton = useReturnFocusOnClose(beingGraded);

  return (
    <div
      className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all ${
        graded ? 'border-emerald-500/30' : 'border-border hover:border-primary/50'
      } ${beingGraded ? 'ring-2 ring-primary/50 shadow-md' : ''}`}
    >
      <div
        className={`p-5 flex flex-col md:flex-row md:items-center gap-4 ${beingGraded ? 'bg-muted/10 border-b border-border/50' : ''}`}
      >
        <StudentIdentity submission={submission} graded={graded} />

        {!beingGraded && (
          <div className="flex items-center gap-3 shrink-0">
            <DeliveredFile submission={submission} />
            {graded && submission.score != null && <GradedScore score={submission.score} />}
            {submission.roundClosed ? (
              <ClosedRound />
            ) : graded ? (
              <button
                ref={startButton}
                type="button"
                onClick={onStart}
                className="p-2 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl transition-colors"
                title="Editar calificación"
                aria-label="Editar calificación"
              >
                <Edit3 className="h-4 w-4" />
              </button>
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
          downloadUrl={fileUrlFor(submission.fileUrl)}
          saving={saving}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function DeliveredFile({ submission }: { submission: ExaminerSubmission }) {
  if (submission.filePurged) return <RetiredFile fileName={submission.fileName} />;

  const downloadUrl = fileUrlFor(submission.fileUrl);
  if (!downloadUrl) return null;
  return (
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
  );
}

function ClosedRound() {
  return (
    <span
      className="flex items-center gap-1.5 px-3 py-2 bg-muted text-muted-foreground rounded-xl text-xs font-bold"
      title="El alumno ya obtuvo el certificado de esta vuelta: su nota no se cambia."
    >
      <Lock className="h-3.5 w-3.5" /> Certificado
    </span>
  );
}

/** Al cerrar el panel, devuelve el foco al botón que lo abrió si no se ha ido a otra parte. */
function useReturnFocusOnClose(open: boolean) {
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (closed && (!document.activeElement || document.activeElement === document.body)) {
      button.current?.focus();
    }
  }, [open]);

  return button;
}

function StudentIdentity({ submission, graded }: { submission: ExaminerSubmission; graded: boolean }) {
  const tone = graded
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400';

  return (
    <div className="flex-1 min-w-0 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${tone}`}>
        {initials(submission.student?.firstName, submission.student?.lastName)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-base text-foreground truncate">
            {submission.student?.firstName} {submission.student?.lastName}
          </h4>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${tone}`}>
            {graded ? 'Calificada' : 'Pendiente'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{dateTime(submission.submittedAt)}</p>
      </div>
    </div>
  );
}

function GradedScore({ score }: { score: number }) {
  const { country } = useCountry();
  return (
    <div className="bg-emerald-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
      <span className="text-sm font-bold">{formatNumber(score, country)}</span>
      <span className="text-[10px] font-bold">/ {MAX_SCORE}</span>
    </div>
  );
}
