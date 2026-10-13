'use client';

import { CheckCircle, Clock, ExternalLink, Paperclip, RefreshCcw, UploadCloud } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import type { Resource } from '@/types/models';
import { isQuiz, externalUrl } from '@/lib/resources';
import { quizSummary } from '@/lib/quiz-config';
import { plural } from '@/lib/text';
import { attemptsLabel } from './resources';

/** Lo que acompaña al contenido en la vista previa: enlace de referencia, adjunto, límite de entrega y cuestionario. */
export function ResourceExtras({ resource }: { resource: Resource }) {
  const quiz = quizSummary(resource.quizConfig);
  const uploadLimit = resource.maxUploadMb && resource.type === 'ASSIGNMENT' && !isQuiz(resource);

  if (!resource.referenceUrl && !resource.attachmentKey && !uploadLimit && !quiz) return null;

  return (
    <div className="space-y-2 mt-4">
      {resource.referenceUrl && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <ExternalLink className="h-4 w-4 text-primary flex-shrink-0" />
          <a
            href={externalUrl(resource.referenceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary font-medium truncate hover:underline"
          >
            {resource.referenceUrl}
          </a>
        </div>
      )}

      {resource.attachmentKey && (
        <a
          href={fileUrlFor(resource.attachmentUrl) ?? ''}
          className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl hover:bg-primary/10 hover:border-primary/30 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Paperclip className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-foreground truncate block">
              {resource.attachmentName || 'Archivo adjunto'}
            </span>
            <span className="text-xs text-muted-foreground">Clic para descargar</span>
          </div>
          <UploadCloud className="h-4 w-4 text-primary rotate-180 flex-shrink-0" />
        </a>
      )}

      {uploadLimit && (
        <div className="flex items-center gap-2 p-2 px-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-500">
          <span className="font-bold">Límite de entrega:</span> {resource.maxUploadMb} MB por estudiante
        </div>
      )}

      {quiz && (
        <div className="flex flex-wrap items-center gap-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-sm">
          <span className="flex items-center gap-1 font-medium">
            <RefreshCcw className="h-3.5 w-3.5 text-amber-500" /> {attemptsLabel(quiz.allowedAttempts)}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <Clock className="h-3.5 w-3.5 text-amber-500" />{' '}
            {quiz.timeLimitMinutes > 0 ? `${quiz.timeLimitMinutes} min` : 'Sin límite'}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <CheckCircle className="h-3.5 w-3.5 text-amber-500" /> {quiz.questions}{' '}
            {plural(quiz.questions, 'pregunta', 'preguntas')}
          </span>
        </div>
      )}
    </div>
  );
}
