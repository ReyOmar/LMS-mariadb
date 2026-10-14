'use client';

import { useState } from 'react';
import { useAlerts } from '@/contexts/AlertContext';
import { usePendingFile } from '@/hooks/usePendingFile';
import { imageUploadWarning, uploadImage } from '@/lib/image-upload';
import type { Course } from '@/types/models';

type ApplyCover = (changes: Pick<Course, 'coverImage'>) => Promise<void>;
type Attempt = (failureTitle: string, action: () => Promise<void>) => Promise<boolean>;

/**
 * Portada del curso: la elegida espera en memoria hasta «Guardar portada», y quitar la guardada
 * la borra del servidor.
 *
 * @param applyCover Guarda la portada en el curso; falla si no se pudo.
 * @param attempt Ejecuta un cambio y avisa si falla.
 */
export function useCoverEditor(applyCover: ApplyCover, attempt: Attempt) {
  const { showAlert, showConfirmation } = useAlerts();
  const pending = usePendingFile();
  const [saving, setSaving] = useState(false);

  const pick = (file: File) => {
    const warning = imageUploadWarning(file, 'portadas');
    if (warning) showAlert.error('No se pudo usar la imagen', warning);
    else pending.pick(file);
  };

  const save = async () => {
    setSaving(true);
    await attempt('No se pudo guardar la portada', () =>
      pending.commit(
        (file) => uploadImage(file, 'portadas'),
        (coverImage) => applyCover({ coverImage }),
      ),
    );
    setSaving(false);
  };

  const remove = async () => {
    const confirmed = await showConfirmation(
      'Quitar la portada',
      'La imagen se borrará del servidor y el curso se mostrará sin portada.',
      'Quitar portada',
    );
    if (confirmed) await attempt('No se pudo quitar la portada', () => applyCover({ coverImage: null }));
  };

  return { previewUrl: pending.previewUrl, saving, pick, save, discard: pending.clear, remove };
}

export type CoverEditor = ReturnType<typeof useCoverEditor>;
