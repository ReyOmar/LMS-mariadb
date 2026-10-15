'use client';

import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { isSearchTooShort } from '@/lib/search';
import { useAlerts } from '@/contexts/AlertContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useInFlight } from '@/hooks/useInFlight';
import type { ContactCandidate } from './inbox';

/**
 * Personas con quienes empezar una conversación: las de los cursos propios o, para un
 * administrador, las de su sede. Se busca al dejar de teclear, no con cada letra.
 */
export function usePeopleSearch(active: boolean) {
  const { showAlert } = useAlerts();
  const requesting = useInFlight<string>();
  const [typed, setTyped] = useState('');
  const applied = useDebounce(typed);
  const [results, setResults] = useState<ContactCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cambia para volver a pedir los resultados sin que cambie el texto buscado. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!active || isSearchTooShort(applied)) {
      setSearching(false);
      return;
    }
    let current = true;
    setSearching(true);
    setError(null);
    api
      .get<ContactCandidate[]>('/notifications/messages/search', { params: { q: applied.trim() } })
      .then(({ data }) => {
        if (current) setResults(data);
      })
      .catch((failure: unknown) => {
        if (current) setError(errorMessage(failure, 'No se pudo buscar.'));
      })
      .finally(() => {
        if (current) setSearching(false);
      });
    return () => {
      current = false;
    };
  }, [active, applied, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const requestContact = (receiverGuid: string) =>
    requesting.run(receiverGuid, async () => {
      try {
        await api.post('/notifications/messages/requests', { receiverGuid });
        // Al volver a pedir los resultados, su botón pasa a «Pendiente».
        refresh();
      } catch (failure) {
        showAlert.error('No se pudo enviar la solicitud', errorMessage(failure));
      }
    });

  return {
    typed,
    setTyped,
    results,
    searching,
    error,
    refresh,
    requestContact,
    isRequesting: requesting.has,
  };
}

export type PeopleSearch = ReturnType<typeof usePeopleSearch>;
