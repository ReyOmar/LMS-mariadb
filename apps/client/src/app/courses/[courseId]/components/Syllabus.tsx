import type { ReactNode } from 'react';
import { BookOpen, CheckCircle, Clock, Layers, Lock, Trophy, X } from 'lucide-react';
import { displayTitle } from '@/lib/resources';
import type { CourseModule, Resource } from '@/types/models';
import { resourcePresentation } from '@/app/dashboard/course-builder/components/resource-presentation';
import type { SyllabusEntry, SyllabusModule } from './progression';

interface Props {
  syllabus: SyllabusModule<CourseModule>[];
  currentGuid: string | null;
  /** En pantalla estrecha flota sobre el contenido, con un fondo que lo cierra. */
  floating: boolean;
  open: boolean;
  onClose: () => void;
  onSelect: (resource: Resource) => void;
}

export function Syllabus({ syllabus, currentGuid, floating, open, onClose, onSelect }: Props) {
  const placement = floating
    ? `fixed inset-y-0 left-0 w-[300px] max-w-[85vw] shadow-2xl ${open ? 'translate-x-0' : '-translate-x-full'}`
    : open
      ? 'w-[320px]'
      : 'w-0 opacity-0 border-r-0';

  return (
    <>
      {floating && open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}
      <nav
        id="course-syllabus"
        aria-label="Temario del curso"
        inert={!open}
        className={`bg-card border-r border-border overflow-y-auto overflow-x-hidden flex flex-col shrink-0 transition-all duration-300 ease-in-out z-50 ${placement}`}
      >
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="flex items-center gap-2 font-bold text-sm text-muted-foreground uppercase tracking-wider">
            <Layers className="h-4 w-4 text-primary" /> Temario del curso
          </h2>
          {floating && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cerrar temario"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <ol className="p-3 space-y-2 flex-1">
          {syllabus.map((item) => (
            <ModuleItem key={item.module.guid} item={item} currentGuid={currentGuid} onSelect={onSelect} />
          ))}
        </ol>
      </nav>
    </>
  );
}

function ModuleItem({
  item,
  currentGuid,
  onSelect,
}: {
  item: SyllabusModule<CourseModule>;
  currentGuid: string | null;
  onSelect: (resource: Resource) => void;
}) {
  const ModuleIcon = !item.open ? Lock : item.finished ? Trophy : BookOpen;
  const iconColor = !item.open ? 'text-muted-foreground' : item.finished ? 'text-emerald-500' : 'text-primary';

  return (
    <li className="rounded-xl border border-border/50 overflow-hidden">
      <p
        className={`flex items-center gap-2 p-3 text-sm font-bold ${
          !item.open ? 'opacity-50' : item.finished ? 'text-emerald-700 dark:text-emerald-400' : ''
        }`}
      >
        <ModuleIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="truncate flex-1">{item.module.title}</span>
      </p>
      {item.open && (
        <ol className="border-t border-border/30 bg-background px-2 py-1 space-y-0.5">
          {item.entries.map((entry) => (
            <ResourceItem
              key={entry.resource.guid}
              entry={entry}
              selected={entry.resource.guid === currentGuid}
              onSelect={onSelect}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function ResourceItem({
  entry,
  selected,
  onSelect,
}: {
  entry: SyllabusEntry<Resource>;
  selected: boolean;
  onSelect: (resource: Resource) => void;
}) {
  const { resource, open, completed, awaitingGrade } = entry;
  const { Icon, colorClass } = resourcePresentation(resource);
  const ItemIcon = open ? Icon : Lock;
  const iconColor = !open ? 'text-muted-foreground/50' : completed ? 'text-emerald-500' : colorClass;

  return (
    <li>
      <button
        type="button"
        disabled={!open}
        onClick={() => onSelect(resource)}
        aria-current={selected ? 'step' : undefined}
        className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left transition-colors ${
          !open
            ? 'opacity-40 cursor-not-allowed'
            : selected
              ? 'bg-primary/10 text-primary font-bold'
              : 'hover:bg-muted text-foreground'
        }`}
      >
        <ItemIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span
          className={`truncate flex-1 ${completed && !awaitingGrade ? 'italic line-through text-muted-foreground' : ''}`}
        >
          {displayTitle(resource)}
        </span>
        {awaitingGrade ? (
          <StatusMark label="Entregada, pendiente de calificación">
            <Clock className="h-3 w-3 text-amber-500" />
          </StatusMark>
        ) : (
          completed && (
            <StatusMark label="Completado">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
            </StatusMark>
          )
        )}
      </button>
    </li>
  );
}

function StatusMark({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span role="img" aria-label={label} title={label} className="shrink-0">
      {children}
    </span>
  );
}
