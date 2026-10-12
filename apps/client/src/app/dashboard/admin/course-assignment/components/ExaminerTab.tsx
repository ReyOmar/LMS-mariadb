'use client';

import { useState } from 'react';
import { Inbox, Loader2, Plus, Presentation, UserMinus, UserPlus } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';
import { useDebounce } from '@/hooks/useDebounce';
import { ROLE_STYLE } from '@/lib/role-style';
import { searchQuery } from '@/lib/search';
import { hasExaminer, type AssignableCourse, type Person } from '../assignment';
import { useExaminers, type Examiners } from '../useExaminers';
import { PersonIdentity } from './PersonIdentity';

const SEARCH_DELAY_MS = 300;
const UNASSIGN = 'unassign';
const BUSY_BUTTON = 'disabled:opacity-50 disabled:pointer-events-none';

interface Props {
  course: AssignableCourse;
  changing: boolean;
  onAssign: (examiner: Person) => void;
  /** El curso vuelve a quien administra: un curso nunca se queda sin responsable. */
  onUnassign: () => void;
}

export function ExaminerTab({ course, changing, onAssign, onUnassign }: Props) {
  const [search, setSearch] = useState('');
  const appliedSearch = searchQuery(useDebounce(search, SEARCH_DELAY_MS));
  const examiners = useExaminers(appliedSearch);
  /** Botón pulsado, para que sólo él muestre que espera: `UNASSIGN` o el examinador elegido. */
  const [pressed, setPressed] = useState<string | null>(null);
  const waitingFor = (key: string) => changing && pressed === key;
  const assigned = hasExaminer(course) ? course.teacher : null;
  // El nombre llega con el curso; el correo, sólo si el examinador está entre los ya cargados.
  const assignedEmail = examiners.items.find((examiner) => examiner.guid === assigned?.guid)?.email;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full md:h-full">
      <div className="flex flex-col min-h-[200px] md:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 bg-blue-500/5">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Presentation className={`h-4 w-4 ${ROLE_STYLE.TEACHER.text}`} /> Examinador asignado
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {assigned ? (
            <div className="flex items-center justify-between gap-3 p-3 bg-card border border-blue-500/20 rounded-xl hover:border-red-500/30 hover:shadow-sm transition-all">
              <PersonIdentity person={{ ...assigned, email: assignedEmail }} role="TEACHER" />
              <button
                type="button"
                onClick={() => {
                  setPressed(UNASSIGN);
                  onUnassign();
                }}
                disabled={changing}
                className={`p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ${BUSY_BUTTON}`}
                aria-label="Quitar examinador"
                title="Quitar examinador"
              >
                {waitingFor(UNASSIGN) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserMinus className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Sin examinador asignado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Busca y asigna un examinador de la lista.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col h-full">
        <div className="mb-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> {assigned ? 'Reemplazar examinador' : 'Asignar examinador'}
          </h3>
          <SearchInput value={search} onChange={setSearch} label="Buscar examinadores por nombre o correo" serverSide />
        </div>

        <ExaminerList
          examiners={examiners}
          searching={appliedSearch !== ''}
          pending={searchQuery(search) !== appliedSearch}
          assignedGuid={course.teacherGuid}
          changing={changing}
          waitingFor={waitingFor}
          onAssign={(examiner) => {
            setPressed(examiner.guid);
            onAssign(examiner);
          }}
        />
      </div>
    </div>
  );
}

interface ListProps {
  examiners: Examiners;
  /** Hay una búsqueda escrita: una lista vacía es «sin resultados», no «sin examinadores». */
  searching: boolean;
  pending: boolean;
  assignedGuid: string;
  changing: boolean;
  waitingFor: (guid: string) => boolean;
  onAssign: (examiner: Person) => void;
}

function ExaminerList({ examiners, searching, pending, assignedGuid, changing, waitingFor, onAssign }: ListProps) {
  if (examiners.error) return <LoadFailed message={examiners.error} onRetry={() => void examiners.retry()} />;
  if (examiners.loading || pending) {
    return (
      <div role="status" aria-label="Buscando examinadores" className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (examiners.items.length === 0) {
    return (
      <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground font-medium">
          {searching ? 'No se encontraron examinadores' : 'No hay examinadores en esta sede'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-2 pb-6">
      {examiners.items.map((examiner) => {
        const isAssigned = examiner.guid === assignedGuid;
        return (
          <div
            key={examiner.guid}
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
              isAssigned
                ? 'bg-blue-500/5 border-blue-500/30'
                : 'bg-background border-border/50 hover:border-blue-500/50 hover:shadow-md'
            }`}
          >
            <PersonIdentity person={examiner} role="TEACHER" />
            {isAssigned ? (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0 ${ROLE_STYLE.TEACHER.tint}`}
              >
                Actual
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAssign(examiner)}
                disabled={changing}
                className={`flex items-center gap-1 px-4 py-2 shrink-0 bg-blue-500/10 hover:bg-blue-600 ${ROLE_STYLE.TEACHER.text} hover:text-white text-xs font-bold rounded-xl transition-colors ${BUSY_BUTTON}`}
              >
                {waitingFor(examiner.guid) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}{' '}
                Asignar
              </button>
            )}
          </div>
        );
      })}

      {examiners.hasMore && (
        <LoadMoreButton
          loading={examiners.loadingMore}
          onClick={() => void examiners.loadMore()}
          className="w-full px-4 py-2 text-xs"
        >
          Ver más examinadores
        </LoadMoreButton>
      )}
    </div>
  );
}
