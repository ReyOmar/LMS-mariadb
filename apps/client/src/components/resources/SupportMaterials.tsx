'use client';

import { ExternalLink, Paperclip, type LucideIcon } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { externalUrl } from '@/lib/resources';

interface Props {
  referenceUrl?: string | null;
  /** URL firmada del adjunto, tal y como la devuelve la API. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

/**
 * Material de apoyo de un recurso: el enlace de referencia y el archivo adjunto. El alumno lo
 * ve igual en lecturas, tareas y cuestionarios, y el examinador, en la vista previa del curso.
 *
 * Los dos se abren en otra pestaña: el archivo se sirve para verse en el navegador, y abrirlo
 * en la misma sacaría al alumno del curso.
 */
export function SupportMaterials({ referenceUrl, attachmentUrl, attachmentName }: Props) {
  if (!referenceUrl && !attachmentUrl) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Material de apoyo</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {referenceUrl && (
          <Material
            href={externalUrl(referenceUrl)}
            icon={ExternalLink}
            title="Enlace de referencia"
            detail={referenceUrl}
          />
        )}
        {attachmentUrl && (
          <Material
            href={fileUrlFor(attachmentUrl) ?? attachmentUrl}
            icon={Paperclip}
            title={attachmentName || 'Archivo adjunto'}
            detail="Descargar documento"
          />
        )}
      </div>
    </section>
  );
}

function Material({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-colors"
    >
      <span className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold truncate">{title}</span>
        <span className="block text-xs text-muted-foreground truncate">{detail}</span>
      </span>
    </a>
  );
}
