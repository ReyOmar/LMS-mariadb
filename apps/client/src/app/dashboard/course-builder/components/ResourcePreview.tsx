'use client';

import type { ReactNode } from 'react';
import { CheckCircle, Edit3, FileText, Link as LinkIcon, PlayCircle, Trash2, Type, UploadCloud } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { fileUrlFor } from '@/lib/api';
import type { Resource } from '@/types/models';
import { ResourceExtras } from './ResourceExtras';
import { linkTarget } from '@/lib/resources';
import type { StoredResourceKind } from './resources';

interface Props {
  type: StoredResourceKind;
  title: string;
  html: string;
  resource: Resource | null;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const ICONS: Record<StoredResourceKind, ReactNode> = {
  PARAGRAPH: <Type className="h-4 sm:h-5 w-4 sm:w-5 text-primary shrink-0" />,
  LINK: <PlayCircle className="h-4 sm:h-5 w-4 sm:w-5 text-pink-500 shrink-0" />,
  ASSIGNMENT: <FileText className="h-4 sm:h-5 w-4 sm:w-5 text-blue-500 shrink-0" />,
  QUIZ: <CheckCircle className="h-4 sm:h-5 w-4 sm:w-5 text-amber-500 shrink-0" />,
};

const NO_CONTENT = '<p class="text-muted-foreground italic">Sin contenido escrito.</p>';
const NO_INSTRUCTIONS = '<p class="text-muted-foreground italic opacity-70">No hay instrucciones definidas.</p>';

/**
 * Cómo se verá el bloque para el alumno.
 *
 * Es una simulación: las áreas de entrega y de cuestionario se muestran inertes, porque el
 * examinador está revisando su propio curso y no debe poder entregar en él.
 */
export function ResourcePreview({ type, title, html, resource, readOnly, onEdit, onDelete }: Props) {
  return (
    <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden h-full max-h-full">
      <div className="p-3 sm:p-4 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <h3 className="font-bold flex items-center gap-2 text-sm sm:text-base min-w-0">
          {ICONS[type]}
          <span className="truncate">{title || 'Sin título'}</span>
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

      <div className="p-8 overflow-y-auto flex-1 space-y-8 bg-background">
        {type === 'PARAGRAPH' && (
          <>
            <div
              className="prose dark:prose-invert max-w-none bg-muted/10 p-8 rounded-2xl border border-border/50 shadow-inner"
              dangerouslySetInnerHTML={sanitizeHTML(html || NO_CONTENT)}
            />
            <ResourceExtras resource={resource} />
          </>
        )}

        {type === 'LINK' && <LinkPreview resource={resource} html={html} />}

        {type === 'ASSIGNMENT' && (
          <Simulation
            instructionsTitle="Instrucciones de la tarea"
            headerClass="bg-muted/10"
            instructionsTitleClass="text-muted-foreground"
            html={html}
            resource={resource}
            icon={<UploadCloud className="h-10 w-10 text-primary" />}
            circleClass="bg-primary/10"
            title="Área de Entrega"
            description="Esta es una simulación visual. Al realizar el curso, el estudiante verá este espacio para subir su respuesta."
            buttonText="Subir archivo"
            buttonClass="bg-primary/50"
          />
        )}

        {type === 'QUIZ' && (
          <Simulation
            instructionsTitle="Instrucciones del cuestionario"
            headerClass="bg-amber-500/10"
            instructionsTitleClass="text-amber-700 dark:text-amber-500"
            html={html}
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

/**
 * Un bloque de enlace puede ser tres cosas —una imagen, un vídeo de YouTube o una página
 * externa— y aquí se enseña cada una como la verá el alumno.
 */
function LinkPreview({ resource, html }: { resource: Resource | null; html: string }) {
  const target = linkTarget(resource ?? { contentHtml: html, fileUrl: null });

  if (target.kind === 'image') {
    return (
      <div className="flex flex-col items-center">
        <img
          src={fileUrlFor(target.url) ?? target.url}
          alt={resource?.title ?? 'Imagen del curso'}
          className="w-full max-w-3xl rounded-2xl border border-border shadow-sm object-contain"
        />
      </div>
    );
  }

  if (target.kind === 'video') {
    return (
      <div className="flex flex-col items-center">
        <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-border shadow-sm">
          {/* @ts-expect-error: elemento personalizado de @justinribeiro/lite-youtube */}
          <lite-youtube videoid={target.video} nocookie></lite-youtube>
        </div>
      </div>
    );
  }

  if (target.kind === 'link') {
    return (
      <div className="flex flex-col items-center">
        <a
          href={target.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-3xl flex items-center gap-4 rounded-2xl border border-border bg-muted/10 p-6 hover:border-pink-500 transition-colors"
        >
          <LinkIcon className="h-8 w-8 text-pink-500 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold truncate">{resource?.title ?? 'Enlace externo'}</p>
            <p className="text-xs text-muted-foreground truncate">{target.url}</p>
          </div>
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-3xl h-64 bg-muted/20 border border-border border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground">
        <PlayCircle className="h-12 w-12 opacity-30 mb-4" />
        <p>Sin destino configurado. Haz clic en «Editar contenido».</p>
      </div>
    </div>
  );
}

interface SimulationProps {
  instructionsTitle: string;
  headerClass: string;
  instructionsTitleClass: string;
  html: string;
  resource: Resource | null;
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
  headerClass,
  instructionsTitleClass,
  html,
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
      <div className={`p-6 border-b border-border ${headerClass}`}>
        <h3 className={`font-bold text-sm uppercase tracking-wider mb-4 ${instructionsTitleClass}`}>
          {instructionsTitle}
        </h3>
        <div
          className="prose dark:prose-invert max-w-none text-foreground"
          dangerouslySetInnerHTML={sanitizeHTML(html || NO_INSTRUCTIONS)}
        />
        <ResourceExtras resource={resource} />
      </div>
      <div className="p-8 flex flex-col items-center justify-center text-center">
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
