'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useDraft } from '@/hooks/useDraft';
import { certificatePayload, type CertificateSettings } from './certificate';

export function useCertificateSettings() {
  const [saved, setSaved] = useState<CertificateSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data } = await api.get<CertificateSettings>('/settings/certificates');
      setSaved(data);
    } catch (error) {
      setLoadError(errorMessage(error, 'Inténtalo de nuevo más tarde.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (changes: Partial<CertificateSettings>) => {
    const { data } = await api.post<CertificateSettings>('/settings/certificates', certificatePayload(changes));
    setSaved(data);
  }, []);

  const draft = useDraft(saved, { persist, successMessage: 'Configuración de certificados actualizada.' });
  return { ...draft, loadError, retry: load };
}
