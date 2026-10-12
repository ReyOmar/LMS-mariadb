'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import type { Candidate } from './assignment';

/**
 * Alumnos de la sede que aún no están en el curso. El servidor los entrega de una vez (hasta
 * `CANDIDATES_SHOWN`), así que la lista es una sola página sin «Ver más».
 *
 * @param search Ya recortado al mínimo con el que busca el servidor; vacío lista los primeros.
 */
export function useCandidates(courseGuid: string, search: string) {
  const fetchCandidates = useCallback(async () => {
    const { data } = await api.get<Candidate[]>(`/enrollments/${encodeURIComponent(courseGuid)}/candidates`, {
      params: { search: search || undefined },
    });
    return { items: Array.isArray(data) ? data : [], cursor: null };
  }, [courseGuid, search]);
  const candidates = usePagedList<Candidate>(fetchCandidates, 'No se pudieron cargar los estudiantes.');
  const { updateItems } = candidates;

  /** Quien ya no es candidato sale de la lista, para no matricularlo dos veces. */
  const drop = useCallback(
    (guids: readonly string[]) => updateItems((items) => items.filter((candidate) => !guids.includes(candidate.guid))),
    [updateItems],
  );

  return { ...candidates, drop };
}

export type Candidates = ReturnType<typeof useCandidates>;
