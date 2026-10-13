'use client';

import { useState, type SetStateAction } from 'react';
import api, { errorMessage, uploadFile } from '@/lib/api';
import { fileSizeWarning, uploadLimit } from '@/lib/upload-limits';
import { useAlerts } from '@/contexts/AlertContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { QuizConfig, Resource } from '@/types/models';
import { newResource, type ResourceKind } from '@/app/dashboard/course-builder/components/resources';
import {
  buildResourcePatch,
  formProblem,
  initialForm,
  sameForm,
  type EditorTarget,
  type ResourceForm,
  type ResourcePatch,
  type StoredAttachment,
} from './resource-form';

/** El alta admite tipo, título y contenido; el resto llega con el `PATCH` que la sigue. */
async function createResource(moduleGuid: string, kind: ResourceKind, patch: ResourcePatch): Promise<string> {
  const { data } = await api.post<Resource>(`/courses/modules/${moduleGuid}/resources`, {
    type: newResource(kind).type,
    title: patch.title,
    contentHtml: patch.contentHtml,
  });
  return data.guid;
}

/**
 * Formulario del editor de recursos. Un recurso nuevo no existe hasta el primer guardado, y el
 * adjunto elegido espera en memoria hasta entonces: así no quedan en el disco subidas sin dueño.
 */
export function useResourceDraft(moduleGuid: string, target: EditorTarget) {
  const { showAlert } = useAlerts();
  const { config } = useConfig();
  const [saved, setSaved] = useState(() => initialForm(target));
  const [form, setForm] = useState(saved);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [resourceGuid, setResourceGuid] = useState(target.resource?.guid ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const dirty = pendingFile !== null || !sameForm(form, saved);
  const confirmDiscard = useUnsavedChangesGuard(dirty);
  const ceilingMb = config?.uploadCeilingMb;
  // El material del curso va con el límite general de la sede; el de la tarea es para las entregas.
  const attachmentLimit = uploadLimit('recursos', config?.maxFileMb, ceilingMb);

  const edit = (changes: Partial<ResourceForm>) => setForm((current) => ({ ...current, ...changes }));

  const editQuiz = (change: SetStateAction<QuizConfig>) =>
    setForm((current) => ({ ...current, quiz: typeof change === 'function' ? change(current.quiz) : change }));

  const pickFile = (file: File) => {
    const warning = fileSizeWarning(file, attachmentLimit);
    if (warning) showAlert.error('No se pudo usar el archivo', warning);
    else setPendingFile(file);
  };

  const removeAttachment = () => {
    setPendingFile(null);
    edit({ attachment: null });
  };

  const uploadPendingFile = async (): Promise<StoredAttachment | null> => {
    if (!pendingFile) return form.attachment;
    setUploadProgress(0);
    try {
      const { filename, url } = await uploadFile('/storage/upload?folder=recursos', pendingFile, {
        limit: attachmentLimit,
        onProgress: setUploadProgress,
      });
      const attachment = { key: filename, name: pendingFile.name, url };
      // Con la clave en el formulario, reintentar tras un fallo al guardar no vuelve a subirlo.
      edit({ attachment });
      setPendingFile(null);
      return attachment;
    } finally {
      setUploadProgress(null);
    }
  };

  /** @returns El recurso guardado, o `null` si no se pudo. */
  const save = async (): Promise<string | null> => {
    const problem = formProblem(target.kind, form, ceilingMb);
    if (problem) {
      showAlert.warning('Revisa el recurso', problem);
      return null;
    }

    setSaving(true);
    try {
      const attachment = await uploadPendingFile();
      const patch = buildResourcePatch(target.kind, form, attachment, ceilingMb);
      const guid = resourceGuid ?? (await createResource(moduleGuid, target.kind, patch));
      setResourceGuid(guid);
      await api.patch(`/courses/resources/${guid}`, patch);
      setSaved({ ...form, attachment });
      return guid;
    } catch (error) {
      showAlert.error('No se pudo guardar', errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    edit,
    editQuiz,
    pendingFile,
    pickFile,
    removeAttachment,
    attachmentLimit,
    dirty,
    confirmDiscard,
    saving,
    uploadProgress,
    save,
  };
}

export type ResourceDraft = ReturnType<typeof useResourceDraft>;
