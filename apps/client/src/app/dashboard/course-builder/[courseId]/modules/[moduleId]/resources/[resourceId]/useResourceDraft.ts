'use client';

import { useState, type SetStateAction } from 'react';
import api, { errorMessage, uploadFile } from '@/lib/api';
import { fileSizeWarning, uploadLimit } from '@/lib/upload-limits';
import { useAlerts } from '@/contexts/AlertContext';
import { useConfig } from '@/contexts/ConfigContext';
import { usePendingFile } from '@/hooks/usePendingFile';
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

/** El alta lleva el recurso completo: si algo no vale, no queda nada creado a medias. */
async function createResource(moduleGuid: string, kind: ResourceKind, patch: ResourcePatch): Promise<string> {
  const { data } = await api.post<Resource>(`/courses/modules/${moduleGuid}/resources`, {
    type: newResource(kind).type,
    ...patch,
  });
  return data.guid;
}

/**
 * Formulario del editor de recursos. Un recurso nuevo no existe hasta el primer guardado. El
 * adjunto elegido espera en memoria y se sube al guardar; si el guardado falla, la subida se
 * retira y el archivo sigue elegido para reintentar.
 */
export function useResourceDraft(moduleGuid: string, target: EditorTarget) {
  const { showAlert } = useAlerts();
  const { config } = useConfig();
  const [saved, setSaved] = useState(() => initialForm(target));
  const [form, setForm] = useState(saved);
  const pendingFile = usePendingFile();
  const [resourceGuid, setResourceGuid] = useState(target.resource?.guid ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const dirty = pendingFile.file !== null || !sameForm(form, saved);
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
    else pendingFile.pick(file);
  };

  const removeAttachment = () => {
    pendingFile.clear();
    edit({ attachment: null });
  };

  const uploadAttachment = async (file: File): Promise<string> => {
    setUploadProgress(0);
    try {
      const { filename } = await uploadFile('/storage/upload?folder=recursos', file, {
        limit: attachmentLimit,
        onProgress: setUploadProgress,
      });
      return filename;
    } finally {
      setUploadProgress(null);
    }
  };

  const persist = async (attachment: StoredAttachment | null): Promise<string> => {
    const patch = buildResourcePatch(target.kind, form, attachment, ceilingMb);
    let guid = resourceGuid;
    if (guid) await api.patch(`/courses/resources/${guid}`, patch);
    else guid = await createResource(moduleGuid, target.kind, patch);
    setResourceGuid(guid);
    edit({ attachment });
    setSaved({ ...form, attachment });
    return guid;
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
      return pendingFile.file
        ? await pendingFile.commit(uploadAttachment, (key, file) => persist({ key, name: file.name, url: null }))
        : await persist(form.attachment);
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
    pendingFile: pendingFile.file,
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
