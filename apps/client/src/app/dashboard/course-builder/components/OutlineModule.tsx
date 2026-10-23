'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { CourseModule } from '@/types/models';
import { AddResourceMenu } from './AddResourceMenu';
import { ResourceRow } from './ResourceRow';
import type { ResourceKind } from './resources';
import type { Selection } from './selection';

interface Props {
  module: CourseModule;
  first: boolean;
  last: boolean;
  selection: Selection;
  expanded: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onSelect: (selection: Selection) => void;
  onDelete: () => void;
  onNewResource: (kind: ResourceKind) => void;
  onMove: (from: number, to: number) => void;
  onMoveModule: (offset: -1 | 1) => void;
}

/** Un módulo del temario con sus recursos, que se reordenan dentro de él. */
export function OutlineModule({
  module,
  first,
  last,
  selection,
  expanded,
  readOnly,
  onToggle,
  onSelect,
  onDelete,
  onNewResource,
  onMove,
  onMoveModule,
}: Props) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const resources = module.resources ?? [];
  const selectedModule = selection.type === 'MODULE' && selection.moduleGuid === module.guid;

  const endDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };

  const drop = () => {
    if (dragged !== null && dropTarget !== null) onMove(dragged, dropTarget);
    endDrag();
  };

  return (
    <div className="border border-border/50 rounded-xl bg-muted/5">
      <div
        className={`flex items-center justify-between p-3 hover:bg-muted/30 transition-colors ${selectedModule ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="p-1 bg-background border border-border shadow-sm hover:border-primary/50 hover:bg-muted rounded-md transition-colors"
            title={expanded ? 'Contraer módulo' : 'Desplegar módulo'}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            type="button"
            className="font-bold text-sm truncate flex-1 text-left"
            onClick={() => onSelect({ type: 'MODULE', moduleGuid: module.guid })}
          >
            {module.title}
          </button>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMoveModule(-1)}
              disabled={first}
              className="p-1.5 rounded border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted disabled:opacity-30"
              aria-label={`Subir el módulo «${module.title}»`}
              title="Subir módulo"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMoveModule(1)}
              disabled={last}
              className="p-1.5 rounded border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted disabled:opacity-30"
              aria-label={`Bajar el módulo «${module.title}»`}
              title="Bajar módulo"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 bg-red-500/10 rounded border border-red-500/20 shadow-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              title="Eliminar módulo"
              aria-label={`Eliminar el módulo «${module.title}»`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <AddResourceMenu onPick={onNewResource} />
          </div>
        )}
      </div>

      {expanded && (
        <div className="bg-background border-t border-border/30 px-3 py-2 space-y-1">
          {resources.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 italic text-center">Vacío</div>
          ) : (
            resources.map((resource, index) => (
              <ResourceRow
                key={resource.guid}
                resource={resource}
                selected={selection.type === 'RESOURCE' && selection.resourceGuid === resource.guid}
                reorderable={!readOnly}
                first={index === 0}
                last={index === resources.length - 1}
                dragging={dragged === index}
                dropTarget={dropTarget === index}
                onSelect={() => onSelect({ type: 'RESOURCE', moduleGuid: module.guid, resourceGuid: resource.guid })}
                onMove={(offset) => onMove(index, index + offset)}
                onDragStart={() => setDragged(index)}
                onDragOver={() => {
                  if (dragged !== null && dragged !== index) setDropTarget(index);
                }}
                onDrop={drop}
                onDragEnd={endDrag}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
