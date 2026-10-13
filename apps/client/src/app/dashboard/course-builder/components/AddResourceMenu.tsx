'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { KIND_PRESENTATION } from './resource-presentation';
import type { ResourceKind } from './resources';

const MENU_ORDER: readonly ResourceKind[] = ['LINK', 'PARAGRAPH', 'QUIZ', 'ASSIGNMENT'];

/** Botón «+» de un módulo y su menú de tipos; se cierra al elegir, al pulsar fuera o con Escape. */
export function AddResourceMenu({ onPick }: { onPick: (kind: ResourceKind) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="p-1.5 bg-background rounded border border-border shadow-sm text-muted-foreground hover:text-primary transition-colors hover:border-primary/30"
        title="Añadir recurso a este módulo"
        aria-label="Añadir recurso a este módulo"
      >
        <Plus className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
          <div className="p-2 text-xs font-bold text-muted-foreground border-b border-border/50 bg-muted/30">
            Añadir recurso
          </div>
          <div className="p-1">
            {MENU_ORDER.map((kind) => {
              const { label, Icon, colorClass } = KIND_PRESENTATION[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(kind);
                  }}
                  className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
                >
                  <Icon className={`h-4 w-4 ${colorClass}`} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
