'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { errorMessage } from '@/lib/api';

interface SignatureSettings {
  /** URL firmada, porque la carpeta de firmas es reservada; al guardar se envía la clave. */
  signatureUrl: string | null;
  signatureName: string | null;
  signatureTitle: string | null;
  firstName: string;
  lastName: string;
}

export interface SignatureDraft {
  signatureName: string;
  signatureTitle: string;
  signatureUrl: string | null;
}

/** Un campo vacío quita el valor: la API lo guarda como `null`. */
function toRequest(changes: Partial<SignatureDraft>) {
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [field, value || null]));
}

/** Firma del examinador en sesión: la guardada y cómo guardar sus cambios. */
export function useSignatureSettings() {
  const [settings, setSettings] = useState<SignatureSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<SignatureSettings>('/settings/signature');
      setSettings(data);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudieron cargar los datos de firma.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (changes: Partial<SignatureDraft>) => {
    const { data } = await api.post<SignatureSettings>('/settings/signature', toRequest(changes));
    setSettings(data);
  }, []);

  const saved = useMemo<SignatureDraft | null>(
    () =>
      settings && {
        signatureName: settings.signatureName ?? '',
        signatureTitle: settings.signatureTitle ?? '',
        signatureUrl: settings.signatureUrl,
      },
    [settings],
  );

  return {
    saved,
    fullName: settings ? `${settings.firstName} ${settings.lastName}` : '',
    error,
    retry: load,
    persist,
  };
}
