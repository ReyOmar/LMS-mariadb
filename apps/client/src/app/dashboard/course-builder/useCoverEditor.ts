'use client';

import { useState } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import { usePendingFile } from '@/hooks/usePendingFile';
import { imageUploadWarning } from '@/lib/image-upload';

/** Portada elegida que espera en memoria hasta «Guardar portada». */
export function useCoverEditor(saveCover: (file: File) => Promise<boolean>) {
  const { showAlert } = useAlerts();
  const pending = usePendingFile();
  const [saving, setSaving] = useState(false);

  const pick = (file: File) => {
    const warning = imageUploadWarning(file, 'portadas');
    if (warning) showAlert.error('No se pudo usar la imagen', warning);
    else pending.pick(file);
  };

  const save = async () => {
    if (!pending.file) return;
    setSaving(true);
    if (await saveCover(pending.file)) pending.clear();
    setSaving(false);
  };

  return { previewUrl: pending.previewUrl, saving, pick, save, discard: pending.clear };
}

export type CoverEditor = ReturnType<typeof useCoverEditor>;
