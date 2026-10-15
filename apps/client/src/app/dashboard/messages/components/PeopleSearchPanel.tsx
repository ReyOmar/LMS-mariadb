import { Loader2, X } from 'lucide-react';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { isSearchTooShort } from '@/lib/search';
import { ROLE_STYLE } from '@/lib/role-style';
import { SearchInput } from '@/components/ui/SearchInput';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { ContactCandidate } from '../inbox';
import type { PeopleSearch } from '../usePeopleSearch';

interface Props {
  search: PeopleSearch;
  /** El administrador busca en toda su sede; el resto, en sus cursos. */
  wholeSite: boolean;
  onWrite: (candidate: ContactCandidate) => void;
  onClose: () => void;
}

export function PeopleSearchPanel({ search, wholeSite, onWrite, onClose }: Props) {
  return (
    <section aria-label="Nueva conversación" className="p-3 border-b border-border bg-muted/20 max-h-80 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          {wholeSite ? 'Buscar en tu sede' : 'Buscar en tus cursos'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-lg"
          aria-label="Cerrar la búsqueda"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <SearchInput
        value={search.typed}
        onChange={search.setTyped}
        label="Nombre o correo electrónico"
        serverSide
        className="mb-2"
      />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        <Results search={search} wholeSite={wholeSite} onWrite={onWrite} />
      </div>
    </section>
  );
}

function Results({ search, wholeSite, onWrite }: Omit<Props, 'onClose'>) {
  if (isSearchTooShort(search.typed)) return null;
  if (search.searching) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Buscando" />
      </div>
    );
  }
  if (search.error) return <p className="text-xs text-red-700 dark:text-red-400 text-center py-3">{search.error}</p>;
  if (search.results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        {wholeSite
          ? 'No se encontró a nadie de tu sede con ese nombre o correo.'
          : 'No se encontraron participantes en tus cursos. Verifica que estés inscrito o asignado a un curso.'}
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {search.results.map((candidate) => (
        <li
          key={candidate.guid}
          className="flex items-center gap-3 p-2.5 rounded-xl bg-card border border-border/30 hover:border-primary/30 transition-colors"
        >
          <UserAvatar person={candidate} role={candidate.role} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold truncate">
                {candidate.firstName} {candidate.lastName}
              </p>
              {candidate.role !== 'STUDENT' && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${ROLE_STYLE[candidate.role].tint}`}
                >
                  {USER_ROLE_LABEL[candidate.role]}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{candidate.email}</p>
          </div>
          <CandidateAction candidate={candidate} search={search} onWrite={onWrite} />
        </li>
      ))}
    </ul>
  );
}

function CandidateAction({
  candidate,
  search,
  onWrite,
}: {
  candidate: ContactCandidate;
  search: PeopleSearch;
  onWrite: (candidate: ContactCandidate) => void;
}) {
  const button =
    'text-[10px] bg-primary text-primary-foreground font-bold px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50';

  if (candidate.canWrite) {
    return (
      <button type="button" onClick={() => onWrite(candidate)} className={button}>
        Escribir
      </button>
    );
  }
  if (candidate.contactStatus === 'PENDING') {
    return (
      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold px-2 py-1 bg-amber-500/10 rounded-full shrink-0">
        Pendiente
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void search.requestContact(candidate.guid)}
      disabled={search.isRequesting(candidate.guid)}
      className={button}
    >
      Solicitar
    </button>
  );
}
