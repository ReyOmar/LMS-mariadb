'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { EmptyState } from './EmptyState';

/** Una carga falló: se dice y se ofrece reintentar, en lugar de un vacío que no es cierto. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      className="bg-card border border-dashed border-border rounded-2xl"
      icon={<AlertTriangle className="h-10 w-10" />}
      title="No se pudo cargar"
      description={message}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RotateCcw className="h-4 w-4" /> Reintentar
        </button>
      }
    />
  );
}
