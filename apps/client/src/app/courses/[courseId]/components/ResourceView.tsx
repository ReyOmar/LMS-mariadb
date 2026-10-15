'use client';

import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { displayTitle, isQuiz } from '@/lib/resources';
import type { Resource } from '@/types/models';
import QuizViewer from '@/components/quiz/QuizViewer';
import AssignmentViewer from '@/components/assignments/AssignmentViewer';
import { ResourceTarget, resourceLabel } from '@/components/resources/ResourceTarget';
import { ResourceExtras } from '@/app/dashboard/course-builder/components/ResourceExtras';

const NO_CONTENT = '<p class="text-muted-foreground italic">Sin contenido.</p>';

interface Props {
  resource: Resource;
  passingScore: number;
  completed: boolean;
  /** La vuelta está cerrada: se repasa sin entregar, responder ni marcar nada. */
  readOnly: boolean;
  marking: boolean;
  onMarkCompleted: () => void;
  /** Una entrega cambió de estado: el avance puede haber cambiado con ella. */
  onAssignmentChanged: () => void;
  onQuizFinished: (passed: boolean) => void;
  onQuizStateChange: (inProgress: boolean) => void;
  onAccessError: (error: unknown, title: string) => boolean;
}

export function ResourceView({
  resource,
  passingScore,
  completed,
  readOnly,
  marking,
  onMarkCompleted,
  onAssignmentChanged,
  onQuizFinished,
  onQuizStateChange,
  onAccessError,
}: Props) {
  // Registra el elemento de los vídeos de YouTube que pinta `ResourceTarget`.
  useEffect(() => {
    if (resource.type === 'LINK') import('@justinribeiro/lite-youtube').catch(() => undefined);
  }, [resource.type]);

  const canMarkCompleted = !readOnly && !completed;

  return (
    <article className="max-w-4xl mx-auto animate-in fade-in duration-300">
      <header className="mb-8 pb-6 border-b border-border">
        <p className="text-primary font-bold tracking-widest uppercase text-xs mb-2">{resourceLabel(resource)}</p>
        <h2 className="text-2xl lg:text-3xl font-bold break-words">{displayTitle(resource)}</h2>
      </header>

      {resource.type === 'TEXT' && (
        <div className="space-y-6">
          <div
            className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-4 sm:p-8 border border-border/50 shadow-sm"
            dangerouslySetInnerHTML={sanitizeHTML(resource.contentHtml || NO_CONTENT)}
          />
          <ResourceExtras resource={resource} />
          {canMarkCompleted && <MarkCompletedButton onClick={onMarkCompleted} busy={marking} />}
        </div>
      )}

      {resource.type === 'LINK' && (
        <div className="space-y-6">
          <ResourceTarget resource={resource} />
          {canMarkCompleted && <MarkCompletedButton onClick={onMarkCompleted} busy={marking} />}
        </div>
      )}

      {/* Un visor por recurso, para no arrastrar el estado de una entrega a otra; se vuelve a montar
          al cerrarse la vuelta porque el servidor retiró los archivos entregados. */}
      {resource.type === 'ASSIGNMENT' && !isQuiz(resource) && (
        <AssignmentViewer
          key={`${resource.guid}:${readOnly ? 'review' : 'study'}`}
          resourceGuid={resource.guid}
          instructionsHtml={resource.contentHtml || ''}
          attachmentUrl={resource.attachmentUrl}
          attachmentName={resource.attachmentName}
          referenceUrl={resource.referenceUrl}
          maxUploadMb={resource.maxUploadMb}
          passingScore={passingScore}
          readOnly={readOnly}
          onFinish={() => {
            if (!readOnly) onAssignmentChanged();
          }}
          onAccessError={onAccessError}
        />
      )}

      {isQuiz(resource) &&
        (readOnly ? (
          <CompletedQuiz resource={resource} />
        ) : (
          <QuizViewer
            key={resource.guid}
            resourceGuid={resource.guid}
            resourceTitle={displayTitle(resource)}
            instructionsHtml={resource.contentHtml || ''}
            referenceUrl={resource.referenceUrl}
            attachmentUrl={resource.attachmentUrl}
            attachmentName={resource.attachmentName}
            onFinish={onQuizFinished}
            onQuizStateChange={onQuizStateChange}
            onAccessError={onAccessError}
          />
        ))}
    </article>
  );
}

function CompletedQuiz({ resource }: { resource: Resource }) {
  return (
    <div className="space-y-4">
      {resource.contentHtml && (
        <div
          className="prose prose-slate dark:prose-invert max-w-none bg-card rounded-2xl p-4 sm:p-6 border border-border/50 shadow-sm"
          dangerouslySetInnerHTML={sanitizeHTML(resource.contentHtml)}
        />
      )}
      <p className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
        <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
        Este cuestionario ya fue completado.
      </p>
    </div>
  );
}

function MarkCompletedButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="mt-8 pt-6 border-t border-border flex justify-center animate-in fade-in duration-500">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 sm:px-8 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 text-base sm:text-lg disabled:opacity-60 disabled:hover:scale-100"
      >
        <CheckCircle className="h-6 w-6" /> Marcar como completado
      </button>
    </div>
  );
}
