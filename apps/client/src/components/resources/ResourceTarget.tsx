'use client';

import type { ReactNode } from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { linkTarget, isQuiz, isApiPath } from '@/lib/resources';
import type { Resource } from '@/types/models';

/**
 * Lo que el alumno ve dentro de un recurso de tipo `LINK`: una imagen, un vídeo de YouTube,
 * un archivo del campus o una página externa, según adónde apunte. La vista previa del
 * constructor usa esta misma pieza, así que el examinador ve exactamente lo que verá el alumno.
 *
 * @param empty Lo que se enseña mientras el enlace no apunta a nada.
 */
export function ResourceTarget({ resource, empty }: { resource: Resource; empty?: ReactNode }) {
  const target = linkTarget(resource);

  if (target.kind === 'image') {
    return (
      <img
        src={fileUrlFor(target.url) ?? target.url}
        alt={resource.title}
        className="w-full rounded-2xl border border-border shadow-sm object-contain"
      />
    );
  }

  if (target.kind === 'video') {
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-border shadow-sm">
        {/* @ts-expect-error: elemento personalizado de @justinribeiro/lite-youtube */}
        <lite-youtube videoid={target.video} nocookie></lite-youtube>
      </div>
    );
  }

  if (target.kind === 'link') {
    // Un archivo lo sirve la API, que puede estar en otro origen; su URL firmada no se
    // enseña, igual que en los adjuntos de una tarea.
    const file = isApiPath(target.url);
    const href = file ? (fileUrlFor(target.url) ?? target.url) : target.url;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 p-6 bg-card border border-border rounded-2xl hover:border-primary hover:bg-primary/5 transition-colors"
      >
        <ExternalLink className="h-7 w-7 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="font-bold truncate">{resource.title}</p>
          <p className="text-xs text-muted-foreground truncate">{file ? 'Descargar documento' : target.url}</p>
        </div>
      </a>
    );
  }

  return (
    <div className="w-full h-64 bg-muted/20 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <PlayCircle className="h-12 w-12 opacity-30" />
      {empty}
    </div>
  );
}

/** Rótulo del recurso. El de un enlace depende de adónde lleve. */
export function resourceLabel(resource: Resource): string {
  if (resource.type === 'TEXT') return 'LECTURA';
  if (resource.type === 'LINK') {
    const target = linkTarget(resource);
    if (target.kind === 'image') return 'IMAGEN';
    if (target.kind === 'link') return 'ENLACE';
    return 'VIDEO';
  }
  return isQuiz(resource) ? 'CUESTIONARIO' : 'TAREA';
}
