'use client';

import { useState } from 'react';
import { Layers, Plus, X } from 'lucide-react';
import type { Course, CourseModule } from '@/types/models';
import { OutlineModule } from './OutlineModule';
import type { ResourceKind } from './resources';
import type { Selection } from './selection';

interface Props {
  course: Course;
  selection: Selection;
  expandedModules: Record<string, boolean>;
  readOnly: boolean;
  onToggleModule: (moduleGuid: string) => void;
  onSelect: (selection: Selection) => void;
  onDeleteModule: (module: CourseModule) => void;
  onCreateModule: () => void;
  onNewResource: (moduleGuid: string, kind: ResourceKind) => void;
  onMoveResource: (moduleGuid: string, from: number, to: number) => void;
}

/** Temario del curso: en escritorio, una columna fija; en el móvil, un cajón lateral con su botón. */
export function CourseOutline({
  course,
  selection,
  expandedModules,
  readOnly,
  onToggleModule,
  onSelect,
  onDeleteModule,
  onCreateModule,
  onNewResource,
  onMoveResource,
}: Props) {
  const [visible, setVisible] = useState(false);
  const modules = course.modules ?? [];

  const select = (picked: Selection) => {
    onSelect(picked);
    // En el móvil el temario tapa el panel: al elegir algo, se aparta.
    setVisible(false);
  };

  return (
    <>
      {/* Por encima del aviso de almacenamiento mientras se ve: ocupa el borde de abajo en el móvil. */}
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="lg:hidden fixed bottom-[calc(5rem+var(--storage-notice-space,0px))] right-6 z-30 h-14 w-14 bg-primary text-primary-foreground rounded-full shadow-xl flex items-center justify-center hover:bg-primary/90 transition-all active:scale-95"
        title="Temario del curso"
        aria-label="Temario del curso"
      >
        <Layers className="h-6 w-6" />
      </button>

      {visible && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setVisible(false)}
        />
      )}

      <div
        className={`w-[350px] max-w-[85vw] bg-card border-l border-border overflow-y-auto flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-50 fixed lg:relative right-0 top-0 h-full lg:h-auto transition-transform duration-300 ease-in-out ${visible ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-5 border-b border-border sticky top-0 bg-inherit z-10 flex items-center justify-between">
          <h2 className="font-bold text-lg tracking-tight flex items-center gap-2 uppercase text-muted-foreground">
            <Layers className="h-5 w-5" /> Temario del curso
          </h2>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar temario"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 flex-1 space-y-4">
          {modules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No hay módulos creados aún.</div>
          ) : (
            modules.map((courseModule) => (
              <OutlineModule
                key={courseModule.guid}
                module={courseModule}
                selection={selection}
                expanded={Boolean(expandedModules[courseModule.guid])}
                readOnly={readOnly}
                onToggle={() => onToggleModule(courseModule.guid)}
                onSelect={select}
                onDelete={() => onDeleteModule(courseModule)}
                onNewResource={(kind) => onNewResource(courseModule.guid, kind)}
                onMove={(from, to) => onMoveResource(courseModule.guid, from, to)}
              />
            ))
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={onCreateModule}
              className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-border rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors font-bold text-sm"
            >
              <Plus className="h-4 w-4" /> Agregar módulo
            </button>
          )}
        </div>
      </div>
    </>
  );
}
