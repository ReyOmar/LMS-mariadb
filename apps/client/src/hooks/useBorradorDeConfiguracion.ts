'use client';

import { useCallback, useMemo, useState } from 'react';
import api, { mensajeDeError } from '@/lib/api';
import { ConfigSede, useConfig } from '@/contexts/ConfigContext';
import { useAlert } from '@/contexts/AlertContext';

/**
 * Edición de la configuración de la sede con guardado explícito.
 *
 * Las tres pantallas de personalización (tema, portada y certificados) hacían lo mismo por
 * separado: llevar el valor en edición, aplicarlo en pantalla para la vista previa y
 * mandarlo al servidor. Aquí está una sola vez, con una diferencia importante respecto a
 * la versión anterior: se distingue el borrador de lo guardado, de modo que la pantalla
 * puede avisar de que hay cambios sin guardar en lugar de perderlos al navegar.
 *
 * @param conVistaPrevia Aplica los cambios al tema en vivo mientras se editan. Sólo tiene
 *        sentido en la pantalla de apariencia; en las demás sería un parpadeo inútil.
 */
export function useBorradorDeConfiguracion(conVistaPrevia = false) {
  const { config, previsualizar, recargar } = useConfig();
  const { showAlert } = useAlert();

  const [cambios, setCambios] = useState<Partial<ConfigSede>>({});
  const [guardando, setGuardando] = useState(false);

  /** Valor efectivo: lo guardado con los cambios pendientes encima. */
  const borrador = useMemo(
    () => (config ? ({ ...config, ...cambios } as ConfigSede) : null),
    [config, cambios],
  );

  const hayCambios = Object.keys(cambios).length > 0;

  const editar = useCallback(
    (parcial: Partial<ConfigSede>) => {
      setCambios((previos) => ({ ...previos, ...parcial }));
      if (conVistaPrevia) previsualizar(parcial);
    },
    [conVistaPrevia, previsualizar],
  );

  const descartar = useCallback(async () => {
    setCambios({});
    await recargar();
  }, [recargar]);

  const guardar = useCallback(async () => {
    if (!hayCambios) return true;

    setGuardando(true);
    try {
      await api.post('/configuracion', cambios);
      setCambios({});
      await recargar();
      showAlert.success('Cambios guardados', 'La configuración de la sede se actualizó correctamente.');
      return true;
    } catch (error) {
      // El servidor valida campo por campo y devuelve qué falla; se muestra tal cual.
      showAlert.error('No se pudo guardar', mensajeDeError(error));
      return false;
    } finally {
      setGuardando(false);
    }
  }, [cambios, hayCambios, recargar, showAlert]);

  return { borrador, editar, guardar, descartar, hayCambios, guardando };
}
