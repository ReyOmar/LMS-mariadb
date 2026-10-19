'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Edit3, Trash2, UploadCloud } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { hasContent } from '@/lib/editor-html';
import { displayTitle } from '@/lib/resources';
import type { Resource } from '@/types/models';
import { ResourceTarget } from '@/components/resources/ResourceTarget';
import { ResourceExtras } from './ResourceExtras';
import { resourcePresentation } from './resource-presentation';
import { isUnconfigured } from './resources';

interface Props {
  resource: Resource;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const NO_CONTENT = '<p class="text-muted-foreground italic">Sin contenido escrito.</p>';
const NO_INSTRUCTIONS = '<p class="text-muted-foreground italic opacity-70">No hay instrucciones definidas.</p>';

/** Cómo verá el alumno el recurso. Entregar y responder quedan inertes: es el curso propio. */
export function ResourcePreview({ resource, readOnly, onEdit, onDelete }: Props) {
  const { kind, Icon, colorClass } = resourcePresentation(resource);

  useEffect(() => {
    if (kind === 'LINK') import('@justinribeiro/lite-youtube').catch(() => undefined);
  }, [kind]);

  return (
    <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden h-full max-h-full">
      <div className="p-3 sm:p-4 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <h3 className="font-bold flex items-center gap-2 text-sm sm:text-base min-w-0">
          <Icon className={`h-4 sm:h-5 w-4 sm:w-5 shrink-0 ${colorClass}`} />
          <span className="truncate">{displayTitle(resource) || 'Sin título'}</span>
        </h3>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={onEdit}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors ${readOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
          >
            <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{readOnly ? 'Solo lectura' : 'Editar contenido'}</span>
            <span className="sm:hidden">{readOnly ? 'Lectura' : 'Editar'}</span>
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={onDelete}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1 transition-colors ${readOnly ? 'text-muted-foreground bg-muted cursor-not-allowed' : 'text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 bg-red-500/10'}`}
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      </div>

      {isUnconfigured(resource) && (
        <p className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 text-sm font-bold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {kind === 'QUIZ'
            ? 'Sin configurar: añade las preguntas antes de publicar el curso.'
            : 'Sin configurar: escribe la dirección del enlace antes de publicar el curso.'}
        </p>
      )}

      <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-8 bg-background">
        {kind === 'PARAGRAPH' && (
          <>
            <div
              className="prose dark:prose-invert max-w-none bg-muted/10 p-4 sm:p-8 rounded-2xl border border-border/50 shadow-inner"
              dangerouslySetInnerHTML={sanitizeHTML(
                hasContent(resource.contentHtml) ? resource.contentHtml : NO_CONTENT,
              )}
            />
            <ResourceExtras resource={resource} />
          </>
        )}

        {kind === 'LINK' && (
          <div className="w-full max-w-3xl mx-auto">
            <ResourceTarget resource={resource} empty={<p>Sin destino configurado. Pulsa «Editar contenido».</p>} />
          </div>
        )}

        {kind === 'ASSIGNMENT' && (
          <Simulation
            instructionsTitle="Instrucciones de la tarea"
            accent="bg-muted/10"
            instructionsTitleClass="text-muted-foreground"
            resource={resource}
            icon={<UploadCloud className="h-10 w-10 text-primary" />}
            circleClass="bg-primary/10"
            title="Área de Entrega"
            description="Esta es una simulación visual. Al realizar el curso, el estudiante verá este espacio para subir su respuesta."
            buttonText="Subir archivo"
            buttonClass="bg-primary/50"
          />
        )}

        {kind === 'QUIZ' && (
          <Simulation
            instructionsTitle="Instrucciones del cuestionario"
            accent="bg-amber-500/10"
            instructionsTitleClass="text-amber-700 dark:text-amber-500"
            resource={resource}
            icon={<CheckCircle className="h-10 w-10 text-amber-500" />}
            circleClass="bg-amber-500/20"
            title="Cuestionario interactivo"
            description="Esta es una simulación visual. Al realizar el curso, el estudiante accederá al cuestionario interactivo desde aquí."
            buttonText="Comenzar intento"
            buttonClass="bg-amber-500/50"
          />
        )}
      </div>
    </div>
  );
}

interface SimulationProps {
  instructionsTitle: string;
  accent: string;
  instructionsTitleClass: string;
  resource: Resource;
  icon: ReactNode;
  circleClass: string;
  title: string;
  description: string;
  buttonText: string;
  buttonClass: string;
}

/** Instrucciones arriba y actividad inerte abajo: el molde común de tareas y cuestionarios. */
function Simulation({
  instructionsTitle,
  accent,
  instructionsTitleClass,
  resource,
  icon,
  circleClass,
  title,
  description,
  buttonText,
  buttonClass,
}: SimulationProps) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-3xl mx-auto">
      <div className={`p-4 sm:p-6 border-b border-border ${accent}`}>
        <h3 className={`font-bold text-sm uppercase tracking-wider mb-4 ${instructionsTitleClass}`}>
          {instructionsTitle}
        </h3>
        <div
          className="prose dark:prose-invert max-w-none text-foreground"
          dangerouslySetInnerHTML={sanitizeHTML(
            hasContent(resource.contentHtml) ? resource.contentHtml : NO_INSTRUCTIONS,
          )}
        />
        <ResourceExtras resource={resource} />
      </div>
      <div className="p-4 sm:p-8 flex flex-col items-center justify-center text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${circleClass}`}>{icon}</div>
        <h3 className="font-bold text-xl mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-md mb-8">{description}</p>
        <button
          type="button"
          disabled
          className={`text-white px-8 py-3 rounded-xl font-bold cursor-not-allowed ${buttonClass}`}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
