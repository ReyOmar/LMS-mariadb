import { Loader2, Plus, UserPlus } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { searchQuery } from '@/lib/search';
import { CANDIDATES_SHOWN, fullName, type Candidate } from '../assignment';
import type { Candidates } from '../useCandidates';
import type { CandidateSelection } from '../useCandidateSelection';
import type { BatchProgress } from '../useEnrollmentActions';
import { BatchEnrollBar } from './BatchEnrollBar';
import { PersonIdentity } from './PersonIdentity';

interface Props {
  candidates: Candidates;
  search: string;
  onSearch: (text: string) => void;
  /** Lo escrito aún no se ha enviado al servidor: la lista a la vista es de la búsqueda anterior. */
  searchPending: boolean;
  selection: CandidateSelection;
  batchProgress: BatchProgress | null;
  isEnrolling: (guid: string) => boolean;
  onEnroll: (candidate: Candidate) => void;
  onEnrollSelected: () => void;
}

export function CandidatePicker({
  candidates,
  search,
  onSearch,
  searchPending,
  selection,
  batchProgress,
  isEnrolling,
  onEnroll,
  onEnrollSelected,
}: Props) {
  const visible = candidates.items;
  const ready = !candidates.loading && !candidates.error && !searchPending;

  return (
    <div className="flex flex-col min-h-[320px] max-h-[36rem] 2xl:max-h-none 2xl:h-full">
      <div className="mb-3">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" /> Agregar estudiantes
        </h3>
        <SearchInput value={search} onChange={onSearch} label="Buscar estudiantes por nombre o correo" serverSide />
      </div>

      <BatchEnrollBar
        progress={batchProgress}
        selectedCount={selection.count}
        allVisibleSelected={selection.allSelected(visible)}
        canSelectVisible={ready && visible.length > 0}
        onToggleVisible={() => selection.toggleVisible(visible)}
        onClearSelection={selection.clear}
        onEnrollSelected={onEnrollSelected}
      />

      <div className="flex-1 overflow-y-auto space-y-2 pb-6">
        {candidates.error ? (
          <LoadFailed message={candidates.error} onRetry={() => void candidates.retry()} />
        ) : !ready ? (
          <div role="status" aria-label="Buscando estudiantes" className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground font-medium">
              {searchQuery(search) ? 'No se encontraron estudiantes' : 'Todos los estudiantes están matriculados'}
            </p>
          </div>
        ) : (
          visible.map((candidate) => (
            <CandidateRow
              key={candidate.guid}
              candidate={candidate}
              selected={selection.has(candidate.guid)}
              busy={batchProgress !== null || isEnrolling(candidate.guid)}
              onToggle={() => selection.toggle(candidate)}
              onEnroll={() => onEnroll(candidate)}
            />
          ))
        )}

        {ready && visible.length >= CANDIDATES_SHOWN && (
          <p className="text-xs text-center text-muted-foreground py-2">
            Se muestran los primeros {CANDIDATES_SHOWN}. Escribe para afinar la búsqueda.
          </p>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  candidate: Candidate;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onEnroll: () => void;
}

function CandidateRow({ candidate, selected, busy, onToggle, onEnroll }: RowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 bg-background border rounded-xl hover:border-emerald-500/50 hover:shadow-md transition-all ${
        selected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border/50'
      }`}
    >
      <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={busy}
          className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <PersonIdentity
          person={candidate}
          role="STUDENT"
          details={
            candidate.certified && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Ya certificado · volvería a empezar
              </p>
            )
          }
        />
      </label>
      <button
        type="button"
        onClick={onEnroll}
        disabled={busy}
        aria-label={`Agregar a ${fullName(candidate)}`}
        title="Agregar al curso"
        className="p-2 shrink-0 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
