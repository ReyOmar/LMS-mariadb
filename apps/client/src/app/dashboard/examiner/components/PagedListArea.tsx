import type { ReactNode } from 'react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';

interface PagedListState {
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  retry: () => Promise<void>;
  loadMore: () => Promise<void>;
}

interface Props {
  list: PagedListState;
  loadingMessage: string;
  loadMoreLabel: string;
  children: ReactNode;
}

/** Estados de una lista paginada de `usePagedList`: el error con reintento, la carga y «Ver más». */
export function PagedListArea({ list, loadingMessage, loadMoreLabel, children }: Props) {
  if (list.error) return <LoadFailed message={list.error} onRetry={() => void list.retry()} />;
  if (list.loading) return <PageLoader message={loadingMessage} />;

  return (
    <>
      {children}
      {list.hasMore && (
        <LoadMoreButton
          loading={list.loadingMore}
          onClick={() => void list.loadMore()}
          className="mt-6 w-full px-4 py-3 text-sm"
        >
          {loadMoreLabel}
        </LoadMoreButton>
      )}
    </>
  );
}
