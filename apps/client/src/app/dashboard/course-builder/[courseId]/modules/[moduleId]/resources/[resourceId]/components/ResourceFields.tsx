'use client';

import { Link as LinkIcon } from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';
import { QuizEditor } from '@/app/dashboard/course-builder/components/QuizEditor';
import type { ResourceKind } from '@/app/dashboard/course-builder/components/resources';
import { MAX_TITLE_LENGTH } from '@/app/dashboard/course-builder/components/names';
import type { ResourceDraft } from '../useResourceDraft';
import { ContentEditor } from './ContentEditor';
import { AttachmentField } from './AttachmentField';
import { EditorSection } from './EditorSection';
import { SubmissionLimitField } from './SubmissionLimitField';

const INPUT = 'w-full bg-muted border border-border rounded-xl px-4 focus:outline-none focus:ring-2';

const CONTENT_LABEL: Record<Exclude<ResourceKind, 'LINK'>, string> = {
  PARAGRAPH: 'Contenido del párrafo',
  ASSIGNMENT: 'Instrucciones para la tarea',
  QUIZ: 'Instrucciones del cuestionario',
};

interface Props {
  kind: ResourceKind;
  draft: ResourceDraft;
  readOnly: boolean;
}

/** Los campos del recurso según su tipo; en modo consulta se desactivan todos a la vez. */
export function ResourceFields({ kind, draft, readOnly }: Props) {
  const { config } = useConfig();
  const { form, edit } = draft;

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-8">
      <div>
        <label
          htmlFor="resource-title"
          className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2"
        >
          Título de la actividad
        </label>
        <input
          id="resource-title"
          type="text"
          value={form.title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => edit({ title: e.target.value })}
          className={`${INPUT} py-3 focus:ring-primary/50 font-bold text-lg`}
          placeholder="Ingresa un título..."
        />
      </div>

      {kind === 'LINK' ? (
        <div>
          <label
            htmlFor="resource-url"
            className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2"
          >
            Dirección (vídeo de YouTube, imagen o página)
          </label>
          <input
            id="resource-url"
            type="url"
            value={form.content}
            onChange={(e) => edit({ content: e.target.value })}
            className={`${INPUT} py-4 text-lg focus:ring-pink-500/50 font-medium`}
            placeholder="https://…"
          />
        </div>
      ) : (
        <>
          <ContentEditor
            label={CONTENT_LABEL[kind]}
            placeholder={
              kind === 'PARAGRAPH' ? 'Escribe tu contenido aquí...' : 'Escribe las instrucciones detalladas...'
            }
            value={form.content}
            readOnly={readOnly}
            onChange={(content) => edit({ content })}
          />

          <EditorSection icon={LinkIcon} title="URL de referencia" optional>
            <input
              type="url"
              value={form.referenceUrl}
              onChange={(e) => edit({ referenceUrl: e.target.value })}
              className={`${INPUT} bg-background py-3 focus:ring-primary/50 text-sm`}
              placeholder="https://ejemplo.com/recurso-adicional"
              aria-label="URL de referencia"
            />
            <p className="text-xs text-muted-foreground">
              Si añades una URL, el estudiante verá un enlace para acceder a recursos externos adicionales.
            </p>
          </EditorSection>

          <AttachmentField
            attachment={form.attachment}
            pendingFile={draft.pendingFile}
            limit={draft.attachmentLimit}
            readOnly={readOnly}
            disabled={draft.saving}
            onPick={draft.pickFile}
            onRemove={draft.removeAttachment}
          />
        </>
      )}

      {kind === 'ASSIGNMENT' && (
        <SubmissionLimitField
          text={form.maxUploadText}
          siteLimitMb={config?.maxFileMb}
          ceilingMb={config?.uploadCeilingMb}
          onChange={(maxUploadText) => edit({ maxUploadText })}
        />
      )}

      {kind === 'QUIZ' && <QuizEditor config={form.quiz} onChange={draft.editQuiz} />}
    </fieldset>
  );
}
