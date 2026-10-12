'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { pendingChanges } from '@/lib/draft';
import { useAlerts } from '@/contexts/AlertContext';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

interface DraftOptions<T> {
  /** Envía al servidor los cambios que difieren de lo guardado. */
  persist: (changes: Partial<T>) => Promise<void>;
  successMessage: string;
  /** Refleja cada edición fuera del formulario, como la vista previa del tema. */
  onEdit?: (changes: Partial<T>) => void;
  /** Deshace lo que reflejó `onEdit` cuando se sale sin guardar. */
  onDiscard?: () => void;
  /** Archivos elegidos que aún no se han subido: también son cambios sin guardar. */
  hasPendingFiles?: boolean;
}

/** Edición con guardado explícito: el borrador, si difiere de lo guardado y el guardado. */
export function useDraft<T extends object>(saved: T | null, options: DraftOptions<T>) {
  const { persist, successMessage, onEdit, onDiscard, hasPendingFiles = false } = options;
  const { showAlert, notify } = useAlerts();
  const [changes, setChanges] = useState<Partial<T>>({});
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => (saved ? ({ ...saved, ...changes } as T) : null), [saved, changes]);
  const pending = useMemo(() => (saved ? pendingChanges(saved, changes) : {}), [saved, changes]);
  const hasChanges = hasPendingFiles || Object.keys(pending).length > 0;

  const edit = useCallback(
    (partial: Partial<T>) => {
      setChanges((previous) => ({ ...previous, ...partial }));
      onEdit?.(partial);
    },
    [onEdit],
  );

  const discardOnExit = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    discardOnExit.current = hasChanges ? onDiscard : undefined;
  });
  useEffect(() => () => discardOnExit.current?.(), []);

  useUnsavedChangesGuard(hasChanges);

  /** @param uploadFiles Sube los archivos pendientes justo antes de guardar y devuelve sus claves. */
  const save = useCallback(
    async (uploadFiles?: () => Promise<Partial<T>>) => {
      if (!hasChanges || saving) return;
      setSaving(true);
      try {
        const uploaded = uploadFiles ? await uploadFiles() : {};
        await persist({ ...pending, ...uploaded });
        setChanges({});
        notify.success(successMessage);
      } catch (error) {
        showAlert.error('No se pudo guardar', errorMessage(error));
      } finally {
        setSaving(false);
      }
    },
    [hasChanges, saving, pending, persist, notify, successMessage, showAlert],
  );

  return { draft, edit, save, hasChanges, saving };
}
