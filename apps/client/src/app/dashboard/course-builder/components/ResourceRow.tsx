'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { displayTitle } from '@/lib/resources';
import type { Resource } from '@/types/models';
import { resourcePresentation } from './resource-presentation';
import { isUnconfigured } from './resources';

interface Props {
  resource: Resource;
  selected: boolean;
  /** Sólo en borrador; además de arrastrar, las flechas lo permiten con el teclado y en pantallas táctiles. */
  reorderable: boolean;
  first: boolean;
  last: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onMove: (offset: -1 | 1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function ResourceRow({
  resource,
  selected,
  reorderable,
  first,
  last,
  dragging,
  dropTarget,
  onSelect,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const { label, Icon } = resourcePresentation(resource);
  const title = displayTitle(resource);

  return (
    <div
      draggable={reorderable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1 rounded-lg transition-all text-sm ${selected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-muted-foreground hover:text-foreground'} ${dragging ? 'opacity-50 border border-dashed border-primary' : ''} ${dropTarget ? 'border-t-2 border-t-primary' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex-1 min-w-0 flex items-center gap-3 p-2 text-left"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{label}:</span>
        <span className="truncate flex-1">{title}</span>
        {isUnconfigured(resource) && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
            Sin configurar
          </span>
        )}
      </button>

      {reorderable && (
        <span className="flex shrink-0 pr-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            className="p-1 rounded hover:bg-background disabled:opacity-30"
            aria-label={`Subir «${title}»`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            className="p-1 rounded hover:bg-background disabled:opacity-30"
            aria-label={`Bajar «${title}»`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}
