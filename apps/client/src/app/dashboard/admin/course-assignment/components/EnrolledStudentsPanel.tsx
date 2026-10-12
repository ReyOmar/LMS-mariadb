import { CheckCircle, Inbox, Loader2, UserMinus } from 'lucide-react';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { shortDate } from '@/lib/dates';
import { fullName, type EnrolledStudent } from '../assignment';
import type { EnrolledStudents } from '../useEnrolledStudents';
import { PersonIdentity } from './PersonIdentity';

interface Props {
  enrolled: EnrolledStudents;
  onUnenroll: (student: EnrolledStudent) => void;
}

export function EnrolledStudentsPanel({ enrolled, onUnenroll }: Props) {
  const total = enrolled.totals ?? 0;

  return (
    <div className="flex flex-col min-h-[280px] max-h-80 2xl:max-h-none 2xl:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-border/50 bg-emerald-500/5 flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-500" /> Ya matriculados
        </h3>
        {!enrolled.loading && !enrolled.error && (
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold px-2.5 py-0.5 rounded-full text-xs">
            {total}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {enrolled.error ? (
          <LoadFailed message={enrolled.error} onRetry={() => void enrolled.retry()} />
        ) : enrolled.loading ? (
          <div role="status" aria-label="Cargando matriculados" className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : enrolled.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Ningún estudiante matriculado</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Búscalos y añádelos en «Agregar estudiantes».</p>
          </div>
        ) : (
          enrolled.items.map((student) => (
            <div
              key={student.guid}
              className="flex items-center justify-between gap-3 p-3 bg-card border border-border/30 rounded-xl hover:border-red-500/30 hover:shadow-sm transition-all"
            >
              <PersonIdentity
                person={student}
                role="STUDENT"
                details={
                  <p className="text-[11px] text-muted-foreground/80">Matrícula: {shortDate(student.enrolledAt)}</p>
                }
              />
              <button
                type="button"
                onClick={() => onUnenroll(student)}
                aria-label={`Desmatricular a ${fullName(student)}`}
                title="Desmatricular"
                className="p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <UserMinus className="h-4 w-4" />
              </button>
            </div>
          ))
        )}

        {enrolled.hasMore && !enrolled.loading && (
          <LoadMoreButton
            loading={enrolled.loadingMore}
            onClick={() => void enrolled.loadMore()}
            className="w-full px-4 py-2 text-xs"
          >
            {`Ver más (${enrolled.items.length} de ${total})`}
          </LoadMoreButton>
        )}
      </div>
    </div>
  );
}
