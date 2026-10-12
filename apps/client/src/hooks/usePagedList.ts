'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { appendPage } from '@/lib/pagination';
import { refreshedPage, type Page } from '@/lib/paged-list';
import { useAlerts } from '@/contexts/AlertContext';
import { useCurrentList } from './useCurrentList';

/** Una tanda pedida; las cifras del listado entero sólo llegan con la primera. */
export interface FetchedPage<T, Totals> extends Page<T> {
  totals?: Totals;
}

export type FetchPage<T, Totals> = (cursor?: string) => Promise<FetchedPage<T, Totals>>;

const NO_PAGE: Page<never> = { items: [], cursor: null };

/**
 * `refresh` se pone al día sin perder lo cargado con «Ver más».
 * @param fetchPage Memorizada: cambiarla (otro filtro, otra búsqueda) vuelve a empezar la lista.
 */
export function usePagedList<T extends { guid: string }, Totals = never>(
  fetchPage: FetchPage<T, Totals>,
  failureMessage: string,
) {
  const { notify } = useAlerts();
  const list = useCurrentList();
  const [page, setPage] = useState<Page<T>>(NO_PAGE);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const isCurrent = list.start();
    setPage(NO_PAGE);
    setError(null);
    setLoading(true);
    try {
      const { items, cursor, totals: fresh } = await fetchPage();
      if (!isCurrent()) return;
      setPage({ items, cursor });
      if (fresh !== undefined) setTotals(fresh);
    } catch (failure) {
      if (isCurrent()) setError(errorMessage(failure, failureMessage));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [fetchPage, failureMessage, list]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    if (loading || error) return load();
    const isCurrent = list.extend();
    try {
      const { items, cursor, totals: fresh } = await fetchPage();
      if (!isCurrent()) return;
      setPage((loaded) => refreshedPage(loaded, { items, cursor }));
      if (fresh !== undefined) setTotals(fresh);
    } catch {
      // Lo que está a la vista sigue valiendo; el próximo aviso lo vuelve a intentar.
    }
  }, [loading, error, load, list, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!page.cursor || loadingMore) return;
    const isCurrent = list.extend();
    setLoadingMore(true);
    try {
      const next = await fetchPage(page.cursor);
      if (isCurrent()) setPage((loaded) => ({ items: appendPage(loaded.items, next.items), cursor: next.cursor }));
    } catch (failure) {
      notify.error('No se pudieron cargar más resultados', errorMessage(failure));
    } finally {
      setLoadingMore(false);
    }
  }, [page.cursor, loadingMore, list, fetchPage, notify]);

  const updateItems = useCallback((change: (items: T[]) => T[]) => {
    setPage((loaded) => ({ ...loaded, items: change(loaded.items) }));
  }, []);

  return {
    items: page.items,
    totals,
    hasMore: page.cursor !== null,
    loading,
    loadingMore,
    error,
    retry: load,
    loadMore,
    refresh,
    updateItems,
  };
}
