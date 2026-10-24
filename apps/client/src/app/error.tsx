'use client';

import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

/** Un fallo inesperado al pintar una pantalla. Se ofrece reintentar sin perder la sesión. */
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" />}
        title="Algo salió mal"
        description="Esta pantalla tuvo un problema al mostrarse. Vuelve a intentarlo; si se repite, recarga la página."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Reintentar
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted transition-colors"
            >
              <Home className="h-4 w-4" /> Volver al inicio
            </Link>
          </div>
        }
      />
    </main>
  );
}
