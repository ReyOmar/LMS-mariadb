'use client';

import { useEffect, useState } from 'react';

interface PendingFile {
  file: File;
  previewUrl: string;
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

  return {
    file: pending?.file ?? null,
    previewUrl: pending?.previewUrl ?? null,
    pick: (file: File) => setPending({ file, previewUrl: URL.createObjectURL(file) }),
    clear: () => setPending(null),
  };
}
