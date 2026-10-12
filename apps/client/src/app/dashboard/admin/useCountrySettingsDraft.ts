'use client';

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { CountrySettings, useConfig } from '@/contexts/ConfigContext';
import { useDraft } from '@/hooks/useDraft';
import { savedBaseline } from './settings-baseline';

interface Options {
  /** Aplica cada cambio al campus entero mientras se edita (tema y marca). */
  livePreview?: boolean;
  hasPendingFiles?: boolean;
}

export function useCountrySettingsDraft({ livePreview = false, hasPendingFiles = false }: Options = {}) {
  const { config, preview, reload } = useConfig();
  const [snapshot, setSnapshot] = useState<CountrySettings | null>(null);

  const persist = useCallback(
    async (changes: Partial<CountrySettings>) => {
      await api.post('/settings', changes);
      await reload();
      setSnapshot(null);
    },
    [reload],
  );

  const previewEdit = useCallback(
    (changes: Partial<CountrySettings>) => {
      setSnapshot((current) => savedBaseline(current, config));
      preview(changes);
    },
    [config, preview],
  );

  return useDraft(savedBaseline(snapshot, config), {
    persist,
    successMessage: 'La configuración de la sede se actualizó correctamente.',
    onEdit: livePreview ? previewEdit : undefined,
    onDiscard: livePreview ? () => void reload() : undefined,
    hasPendingFiles,
  });
}
