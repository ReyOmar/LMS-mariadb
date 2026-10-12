'use client';

import { useCallback } from 'react';
import api from '@/lib/api';
import { useRealtimeEvent, useRealtimeReconnect } from '@/contexts/RealtimeContext';
import { usePagedList } from '@/hooks/usePagedList';
import type { User, UserRole } from '@/types/models';

export type CountByRole = Record<UserRole, number>;

interface AccountsResponse {
  total?: number;
  byRole?: CountByRole;
  /** Cuentas de la sede, busque lo que se busque. */
  registered?: number;
  cursor: string | null;
  users: User[];
}

export interface AccountTotals {
  /** Cuentas de la pestaña que casan con la búsqueda. */
  total: number;
  /** Cuentas de cada rol que casan con la búsqueda. */
  byRole: CountByRole;
  registered: number;
}

function totalsOf({ total = 0, byRole, registered = 0 }: AccountsResponse): AccountTotals | undefined {
  return byRole && { total, byRole, registered };
}

/** Cuentas de la sede con un rol, por páginas, al día con los avisos en tiempo real. */
export function useAccounts(role: UserRole, search: string) {
  const fetchPage = useCallback(
    async (cursor?: string) => {
      const { data } = await api.get<AccountsResponse>('/auth/users', {
        params: { role, search: search || undefined, cursor },
      });
      return { items: data.users ?? [], cursor: data.cursor, totals: totalsOf(data) };
    },
    [role, search],
  );
  const accounts = usePagedList<User, AccountTotals>(fetchPage, 'No se pudieron cargar las cuentas.');
  const { refresh, updateItems } = accounts;

  const remove = useCallback(
    (guid: string) => updateItems((users) => users.filter((user) => user.guid !== guid)),
    [updateItems],
  );

  /** Refleja una cuenta recién guardada; si ya no tiene este rol, sale de la lista. */
  const replace = (saved: User) =>
    updateItems((users) =>
      saved.role === role
        ? users.map((user) => (user.guid === saved.guid ? { ...user, ...saved } : user))
        : users.filter((user) => user.guid !== saved.guid),
    );

  useRealtimeEvent('user:created', () => void refresh());
  useRealtimeEvent('user:updated', () => void refresh());
  useRealtimeEvent('user:deleted', (data) => {
    const guid = (data as { guid?: string } | null)?.guid;
    if (guid) remove(guid);
    void refresh();
  });
  useRealtimeReconnect(() => void refresh());

  return { ...accounts, remove, replace };
}

export type Accounts = ReturnType<typeof useAccounts>;
