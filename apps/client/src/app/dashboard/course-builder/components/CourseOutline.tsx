'use client';

import { useState, type ReactNode } from 'react';
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Layers,
  PlayCircle,
  Plus,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { Course, CourseModule, Resource } from '@/types/models';
import { linkTarget, isQuiz, displayTitle } from '@/lib/resources';
import type { ResourceKind } from './resources';

/** Qué está abierto en el panel central. */
export type Selection =
  | { type: 'NONE' }
  | { type: 'MODULE'; module: CourseModule }
  | { type: 'RESOURCE'; resource: Resource; moduleGuid: string };

interface Props {
  course: Course;
  selection: Selection;
  expandedModules: Record<string, boolean>;
  readOnly: boolean;
  /** En móvil el temario es un cajón lateral; en escritorio está siempre visible. */
  visible: boolean;
  onClose: () => void;
  onToggleModule: (moduleGuid: string) => void;
  onSelectModule: (module: CourseModule) => void;
  onSelectResource: (resource: Resource, moduleGuid: string) => void;
  onDeleteModule: (module: CourseModule) => void;
  onCreateModule: () => void;
  onNewResource: (moduleGuid: string, type: ResourceKind) => void;
  onReorder: (moduleGuid: string, from: number, to: number) => void;
}

/** Posición de un recurso dentro de su módulo, mientras se arrastra. */
interface DragItem {
  guid: string;
  moduleGuid: string;
  index: number;
}

/** Árbol de módulos y recursos: navegación, orden y creación de contenido. */
export function CourseOutline({
  course,
  selection,
  expandedModules,
  readOnly,
  visible,
  onClose,
  onToggleModule,
  onSelectModule,
  onSelectResource,
  onDeleteModule,
  onCreateModule,
  onNewResource,
  onReorder,
}: Props) {
  // Son detalles de la interacción con el ratón: no le interesan a la página.
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [dragged, setDragged] = useState<DragItem | null>(null);
  const [dragOver, setDragOver] = useState<DragItem | null>(null);

  const modules = course.modules ?? [];
  const canReorder = course.status === 'DRAFT';

  const drop = (moduleGuid: string) => {
    if (dragged && dragOver && dragged.moduleGuid === moduleGuid && dragOver.moduleGuid === moduleGuid) {
      onReorder(moduleGuid, dragged.index, dragOver.index);
    }
    setDragged(null);
    setDragOver(null);
  };

  return (
    <div
      className={`w-[350px] max-w-[85vw] bg-card border-l border-border overflow-y-auto flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-50 fixed lg:relative right-0 top-0 h-full lg:h-auto transition-transform duration-300 ease-in-out ${visible ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
    >
      <div className="p-5 border-b border-border sticky top-0 bg-inherit z-10 flex items-center justify-between">
        <h2 className="font-bold text-lg tracking-tight flex items-center gap-2 uppercase text-muted-foreground">
          <Layers className="h-5 w-5" /> Temario del curso
        </h2>
        <button
          type="button"
          onClick={onClose}
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
          modules.map((module) => {
            const expanded = Boolean(expandedModules[module.guid]);
            const resources = module.resources ?? [];
            const activeModule = selection.type === 'MODULE' && selection.module.guid === module.guid;

            return (
              <div key={module.guid} className="border border-border/50 rounded-xl bg-muted/5">
                <div
                  className={`flex items-center justify-between p-3 hover:bg-muted/30 transition-colors ${activeModule ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleModule(module.guid)}
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
                      onClick={() => onSelectModule(module)}
                    >
                      {module.title}
                    </button>
                  </div>

                  {!readOnly && (
                    <div className="relative flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDeleteModule(module)}
                        className="p-1.5 bg-red-500/10 rounded border border-red-500/20 shadow-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        title="Eliminar módulo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuOpen(menuOpen === module.guid ? null : module.guid)}
                        className="p-1.5 bg-background rounded border border-border shadow-sm text-muted-foreground hover:text-primary transition-colors hover:border-primary/30"
                        title="Añadir recurso a este módulo"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      {menuOpen === module.guid && (
                        <ResourceMenu
                          onPick={(type) => {
                            setMenuOpen(null);
                            onNewResource(module.guid, type);
                          }}
                        />
                      )}
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
                          selected={selection.type === 'RESOURCE' && selection.resource.guid === resource.guid}
                          isDraggable={canReorder}
                          isDragging={dragged?.guid === resource.guid}
                          target={dragOver?.guid === resource.guid}
                          onSelect={() => onSelectResource(resource, module.guid)}
                          onDragStart={() => setDragged({ guid: resource.guid, moduleGuid: module.guid, index })}
                          onDragOver={() => {
                            if (dragged?.moduleGuid === module.guid && dragged.guid !== resource.guid) {
                              setDragOver({ guid: resource.guid, moduleGuid: module.guid, index });
                            }
                          }}
                          onDrop={() => drop(module.guid)}
                          onDragEnd={() => {
                            setDragged(null);
                            setDragOver(null);
                          }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
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
  );
}

const AVAILABLE_RESOURCES: { type: ResourceKind; label: string; icon: ReactNode }[] = [
  { type: 'LINK', label: 'Video / enlace', icon: <PlayCircle className="h-4 w-4 text-pink-500" /> },
  { type: 'PARAGRAPH', label: 'Texto', icon: <Type className="h-4 w-4 text-primary" /> },
  { type: 'QUIZ', label: 'Cuestionario', icon: <CheckCircle className="h-4 w-4 text-amber-500" /> },
  { type: 'ASSIGNMENT', label: 'Tarea', icon: <FileText className="h-4 w-4 text-blue-500" /> },
];

function ResourceMenu({ onPick }: { onPick: (type: ResourceKind) => void }) {
  return (
    <div className="absolute right-0 top-10 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
      <div className="p-2 text-xs font-bold text-muted-foreground border-b border-border/50 bg-muted/30">
        Añadir recurso
      </div>
      <div className="p-1">
        {AVAILABLE_RESOURCES.map(({ type, label, icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded-lg text-sm transition-colors text-left font-medium"
          >
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  resource: Resource;
  selected: boolean;
  isDraggable: boolean;
  isDragging: boolean;
  target: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function ResourceRow({
  resource,
  selected,
  isDraggable,
  isDragging,
  target,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RowProps) {
  return (
    <div
      draggable={isDraggable}
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
      onClick={onSelect}
      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all text-sm ${selected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-muted-foreground hover:text-foreground'} ${isDragging ? 'opacity-50 border border-dashed border-primary' : ''} ${target ? 'border-t-2 border-t-primary' : ''}`}
    >
      <ResourceIcon resource={resource} />
      <span className="truncate flex-1">{displayTitle(resource)}</span>
    </div>
  );
}

function ResourceIcon({ resource }: { resource: Resource }) {
  const className = 'h-4 w-4 shrink-0';

  if (resource.type === 'TEXT') return <Type className={className} />;
  if (resource.type === 'LINK') {
    const target = linkTarget(resource);
    if (target.kind === 'image') return <ImageIcon className={className} />;
    if (target.kind === 'link') return <LinkIcon className={className} />;
    return <PlayCircle className={className} />;
  }
  if (resource.type === 'ASSIGNMENT') {
    return isQuiz(resource) ? <CheckCircle className={className} /> : <FileText className={className} />;
  }
  return <FileText className={className} />;
}
