import type { ReactNode } from 'react';

/** «Ver más» de una lista paginada: mientras llega la tanda pedida no se puede volver a pulsar. */
export function LoadMoreButton({
  loading,
  onClick,
  className = '',
  children,
}: {
  loading: boolean;
  onClick: () => void;
  /** Tamaño y márgenes, que dependen de la lista. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-xl border border-border font-bold hover:bg-muted transition-colors disabled:opacity-50 ${className}`}
    >
      {loading ? 'Cargando…' : children}
    </button>
  );
}
