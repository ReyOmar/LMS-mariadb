import { Loader2, UserPlus } from 'lucide-react';
import type { BatchProgress } from '../useEnrollmentActions';

interface Props {
  progress: BatchProgress | null;
  selectedCount: number;
  allVisibleSelected: boolean;
  canSelectVisible: boolean;
  onToggleVisible: () => void;
  onClearSelection: () => void;
  onEnrollSelected: () => void;
}

export function BatchEnrollBar({
  progress,
  selectedCount,
  allVisibleSelected,
  canSelectVisible,
  onToggleVisible,
  onClearSelection,
  onEnrollSelected,
}: Props) {
  if (progress) {
    return (
      <div role="status" className="mb-3">
        <p className="text-xs font-bold text-muted-foreground mb-1.5 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matriculando {progress.done} de {progress.total}…
        </p>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (!canSelectVisible && selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={onToggleVisible}
          disabled={!canSelectVisible}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
        Seleccionar los de la lista
      </label>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-colors"
          >
            Quitar selección
          </button>
          <button
            type="button"
            onClick={onEnrollSelected}
            className="flex items-center gap-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-colors"
          >
            <UserPlus className="h-4 w-4" /> Agregar seleccionados ({selectedCount})
          </button>
        </div>
      )}
    </div>
  );
}
