'use client';

import { CheckCircle, Clock, RefreshCcw } from 'lucide-react';
import type { Resource } from '@/types/models';
import { isQuiz } from '@/lib/resources';
import { quizSummary } from '@/lib/quiz-config';
import { plural } from '@/lib/text';
import { SupportMaterials } from '@/components/resources/SupportMaterials';
import { attemptsLabel } from './resources';

/** Lo que acompaña al contenido en la vista previa: material de apoyo, límite de entrega y cuestionario. */
export function ResourceExtras({ resource }: { resource: Resource }) {
  const quiz = quizSummary(resource.quizConfig);
  const uploadLimit = resource.maxUploadMb && resource.type === 'ASSIGNMENT' && !isQuiz(resource);

  if (!resource.referenceUrl && !resource.attachmentUrl && !uploadLimit && !quiz) return null;

  return (
    <div className="space-y-3 mt-4">
      <SupportMaterials
        referenceUrl={resource.referenceUrl}
        attachmentUrl={resource.attachmentUrl}
        attachmentName={resource.attachmentName}
      />

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
