import {
  CheckCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  PlayCircle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { linkTarget } from '@/lib/resources';
import type { Resource } from '@/types/models';
import { resourceKindOf, type ResourceKind } from './resources';

export interface ResourcePresentation {
  kind: ResourceKind;
  label: string;
  Icon: LucideIcon;
  /** Color del icono. */
  colorClass: string;
}

/** Cada tipo antes de tener contenido: en el menú «Añadir recurso» y en el editor. */
export const KIND_PRESENTATION: Record<ResourceKind, ResourcePresentation> = {
  LINK: { kind: 'LINK', label: 'Video / enlace', Icon: PlayCircle, colorClass: 'text-pink-500' },
  PARAGRAPH: { kind: 'PARAGRAPH', label: 'Texto', Icon: Type, colorClass: 'text-primary' },
  QUIZ: { kind: 'QUIZ', label: 'Cuestionario', Icon: CheckCircle, colorClass: 'text-amber-500' },
  ASSIGNMENT: { kind: 'ASSIGNMENT', label: 'Tarea', Icon: FileText, colorClass: 'text-blue-500' },
};

const LINK_PRESENTATION = {
  image: { label: 'Imagen', Icon: ImageIcon },
  link: { label: 'Enlace', Icon: ExternalLink },
  video: { label: 'Video', Icon: PlayCircle },
  empty: { label: 'Video / enlace', Icon: PlayCircle },
} as const;

/** Icono, color y rótulo de un recurso guardado; el de un enlace depende de adónde lleve. */
export function resourcePresentation(
  resource: Pick<Resource, 'type' | 'title' | 'contentHtml' | 'fileUrl' | 'fileDownloadUrl'>,
): ResourcePresentation {
  const kind = resourceKindOf(resource);
  if (kind !== 'LINK') return KIND_PRESENTATION[kind];
  return { ...KIND_PRESENTATION.LINK, ...LINK_PRESENTATION[linkTarget(resource).kind] };
}
