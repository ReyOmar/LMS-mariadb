'use client';

import { useEffect, useState } from 'react';
import api, { isNetworkFailure } from '@/lib/api';

interface PendingFile {
  file: File;
  previewUrl: string;
}

/** Pide a la API que retire una subida propia que ninguna fila usa. Si no puede, sólo queda en el disco. */
async function discardUpload(key: string): Promise<void> {
  try {
    await api.delete('/storage/upload', { params: { key } });
  } catch {
    // Quien guardaba ya está avisando del fallo que importa: el del guardado.
  }
}

/**
 * Sube un archivo y guarda con su clave. Si el guardado falla, retira la subida, que ninguna fila
 * usa, y deja pasar el error.
 */
export async function saveWithUpload<T>(
  upload: () => Promise<string>,
  save: (key: string) => Promise<T>,
  discard: (key: string) => Promise<void>,
): Promise<T> {
  const key = await upload();
  try {
    return await save(key);
  } catch (error) {
    // Sin respuesta, el guardado puede seguir en curso en el servidor y llegar a usar la subida.
    if (!isNetworkFailure(error)) await discard(key);
    throw error;
  }
}

/** Lo que queda pendiente tras guardar `saved`: otro elegido mientras se subía sigue esperando. */
export function pendingAfterSave<T>(current: T | null, saved: T): T | null {
  return current === saved ? null : current;
}

/**
 * Archivo elegido que espera en memoria, con su vista previa local, hasta que se guarda: subirlo
 * al elegirlo dejaría en el disco el que luego se cambia o se descarta.
 */
export function usePendingFile() {
  const [pending, setPending] = useState<PendingFile | null>(null);

  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.previewUrl);
  }, [pending]);

  /**
   * Sube el archivo pendiente y guarda con su clave. Si falla, sigue pendiente para reintentar; si
   * no, deja de estarlo, salvo que entretanto se eligiera otro.
   */
  const commit = async <T>(
    upload: (file: File) => Promise<string>,
    save: (key: string, file: File) => Promise<T>,
  ): Promise<T> => {
    const committed = pending;
    if (!committed) throw new Error('No hay ningún archivo elegido que guardar.');

    const saved = await saveWithUpload(
      () => upload(committed.file),
      (key) => save(key, committed.file),
      discardUpload,
    );
    setPending((current) => pendingAfterSave(current, committed));
    return saved;
  };

  return {
    file: pending?.file ?? null,
    previewUrl: pending?.previewUrl ?? null,
    pick: (file: File) => setPending({ file, previewUrl: URL.createObjectURL(file) }),
    clear: () => setPending(null),
    commit,
  };
}
