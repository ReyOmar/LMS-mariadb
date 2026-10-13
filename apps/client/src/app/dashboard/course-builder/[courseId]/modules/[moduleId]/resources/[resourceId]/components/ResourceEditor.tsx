'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import type { Course } from '@/types/models';
import { builderUrl } from '@/app/dashboard/course-builder/components/paths';
import type { EditorTarget } from '../resource-form';
import { useResourceDraft } from '../useResourceDraft';
import { EditorHeader } from './EditorHeader';
import { ResourceFields } from './ResourceFields';

interface Props {
  course: Course;
  moduleGuid: string;
  target: EditorTarget;
}

/** Edición de un recurso; sólo con el curso en Borrador, como exige la API. */
export function ResourceEditor({ course, moduleGuid, target }: Props) {
  const router = useRouter();
  const draft = useResourceDraft(moduleGuid, target);
  const readOnly = course.status !== 'DRAFT';
  const resourceGuid = target.resource?.guid;

  const returnTo = (savedGuid: string | undefined) =>
    router.push(builderUrl(course.guid, savedGuid ? { moduleGuid, resourceGuid: savedGuid } : undefined));

  const goBack = async () => {
    if (!draft.dirty || (await draft.confirmDiscard())) returnTo(resourceGuid);
  };

  const saveAndReturn = async () => {
    const savedGuid = await draft.save();
    if (savedGuid) returnTo(savedGuid);
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 max-w-4xl mx-auto h-[calc(100vh-6rem)] flex flex-col py-6">
      <EditorHeader
        kind={target.kind}
        isNew={!target.resource}
        readOnly={readOnly}
        saving={draft.saving}
        uploadProgress={draft.uploadProgress}
        onBack={() => void goBack()}
        onSave={() => void saveAndReturn()}
      />

      <div className="flex-1 bg-card border border-border shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {readOnly && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center gap-3">
            <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              Este curso está {COURSE_STATUS_LABEL[course.status].toLowerCase()}. Cambia a estado Borrador desde el
              constructor para editar.
            </p>
          </div>
        )}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1">
          <ResourceFields kind={target.kind} draft={draft} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}
