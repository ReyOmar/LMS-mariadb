'use client';

import { useCallback, useMemo, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { CountrySettings, useConfig } from '@/contexts/ConfigContext';
import { useAlerts } from '@/contexts/AlertContext';

/**
 * Edición de la configuración de la sede con guardado explícito (tema y portada).
 *
 * Lleva el valor en edición, lo aplica en pantalla para la vista previa y lo manda al
 * servidor. Distingue el borrador de lo guardado, de modo que la pantalla puede avisar de
 * que hay cambios sin guardar.
 *
 * @param withPreview Aplica los cambios al tema en vivo mientras se editan. Sólo tiene
 *        sentido en la pantalla de apariencia; en las demás sería un parpadeo inútil.
 */
export function useSettingsDraft(withPreview = false) {
  const { config, preview, reload } = useConfig();
  const { showAlert } = useAlerts();

  const [changes, setChanges] = useState<Partial<CountrySettings>>({});
  const [saving, setSaving] = useState(false);

  /** Valor efectivo: lo guardado con los cambios pendientes encima. */
  const draft = useMemo(() => (config ? ({ ...config, ...changes } as CountrySettings) : null), [config, changes]);

  const hasChanges = Object.keys(changes).length > 0;

  const edit = useCallback(
    (partial: Partial<CountrySettings>) => {
      setChanges((prev) => ({ ...prev, ...partial }));
      if (withPreview) preview(partial);
    },
    [withPreview, preview],
  );

  const discard = useCallback(async () => {
    setChanges({});
    await reload();
  }, [reload]);

  const save = useCallback(async () => {
    if (!hasChanges) return true;

    setSaving(true);
    try {
      await api.post('/settings', changes);
      setChanges({});
      await reload();
      showAlert.success('Cambios guardados', 'La configuración de la sede se actualizó correctamente.');
      return true;
    } catch (error) {
      // El servidor valida campo por campo y devuelve qué falla; se muestra tal cual.
      showAlert.error('No se pudo guardar', errorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  }, [changes, hasChanges, reload, showAlert]);

  return { draft, edit, save, discard, hasChanges, saving };
}
