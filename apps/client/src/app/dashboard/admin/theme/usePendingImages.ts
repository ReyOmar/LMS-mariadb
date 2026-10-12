'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/api';
import { uploadLimit } from '@/lib/upload-limits';

export const IMAGE_FOLDERS = {
  logoUrl: 'logos',
  faviconUrl: 'logos',
  loginBackgroundUrl: 'fondos',
} as const;

export type ImageField = keyof typeof IMAGE_FOLDERS;

interface PendingImage {
  file: File;
  previewUrl: string;
}

type PendingImages = Partial<Record<ImageField, PendingImage>>;

/**
 * Imágenes elegidas que esperan en memoria hasta que se guarda: subirlas al elegirlas dejaba
 * en el disco las que luego se cambiaban o se descartaban.
 */
export function usePendingImages() {
  const [pending, setPending] = useState<PendingImages>({});
  const current = useRef<PendingImages>({});

  const replace = useCallback((field: ImageField, image?: PendingImage) => {
    const previous = current.current[field];
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    const next = { ...current.current };
    if (image) next[field] = image;
    else delete next[field];
    current.current = next;
    setPending(next);
  }, []);

  useEffect(() => () => Object.values(current.current).forEach((image) => URL.revokeObjectURL(image.previewUrl)), []);

  const pick = useCallback(
    (field: ImageField, file: File) => replace(field, { file, previewUrl: URL.createObjectURL(file) }),
    [replace],
  );

  const discard = useCallback((field: ImageField) => replace(field), [replace]);

  /** Sube cada imagen y la entrega a `onUploaded` en cuanto llega, para no repetirla si otra falla. */
  const uploadAll = useCallback(
    async (onUploaded: (field: ImageField, key: string) => void) => {
      const uploaded: Partial<Record<ImageField, string>> = {};
      for (const [field, image] of Object.entries(current.current) as [ImageField, PendingImage][]) {
        const folder = IMAGE_FOLDERS[field];
        const { filename } = await uploadFile(`/storage/upload?folder=${folder}`, image.file, {
          limit: uploadLimit(folder),
        });
        uploaded[field] = filename;
        onUploaded(field, filename);
        replace(field);
      }
      return uploaded;
    },
    [replace],
  );

  return {
    previewOf: (field: ImageField) => pending[field]?.previewUrl ?? null,
    hasPending: Object.keys(pending).length > 0,
    pick,
    discard,
    uploadAll,
  };
}
