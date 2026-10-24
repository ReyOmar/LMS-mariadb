import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

/** Una dirección que no lleva a ninguna página: un enlace mal copiado o que ya no existe. */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <EmptyState
        icon={<Compass className="h-10 w-10" />}
        title="Esta página no existe"
        description="Puede que el enlace esté mal copiado o que la página ya no esté disponible."
        action={
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Home className="h-4 w-4" /> Volver al inicio
          </Link>
        }
      />
    </main>
  );
}
