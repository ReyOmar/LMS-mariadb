import { Save } from 'lucide-react';

/**
 * Barra de guardado de una pantalla de ajustes. Sólo se pinta si hay algo que guardar, para
 * que no quede duda de si los cambios están aplicados, y se coloca por encima del aviso de
 * almacenamiento cuando éste se ve.
 */
export function UnsavedChangesBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="fixed bottom-[calc(1.5rem+var(--storage-notice-space,0px))] left-1/2 -translate-x-1/2 z-40 w-[min(calc(100%-2rem),40rem)]">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-2xl">
        <p className="text-sm font-medium">Tienes cambios sin guardar.</p>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
