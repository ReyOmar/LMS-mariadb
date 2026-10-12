'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { usePagedList } from '@/hooks/usePagedList';
import type { Person } from './assignment';

/** @param search Ya recortado al mínimo con el que busca el servidor; vacío lista los primeros. */
export function useExaminers(search: string) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<{ users: Person[]; cursor: string | null }>('/auth/users', {
        params: { role: 'TEACHER', search: search || undefined, cursor },
      });
      return { items: data.users ?? [], cursor: data.cursor };
    },
    [search],
  );
  return usePagedList<Person>(fetchPage, 'No se pudieron cargar los examinadores.');
}

export type Examiners = ReturnType<typeof useExaminers>;
