'use client';

import { Layers } from 'lucide-react';
import { plural } from '@/lib/text';
import type { CourseModule } from '@/types/models';
import { MAX_TITLE_LENGTH, saveNameOnBlur } from './names';

interface Props {
  module: CourseModule;
  readOnly: boolean;
  onRename: (title: string) => Promise<boolean>;
}

/** Ajustes de un módulo. Su contenido se ordena y se añade desde el temario. */
export function ModuleSettings({ module, readOnly, onRename }: Props) {
  const resources = module.resources?.length ?? 0;

  return (
    <div className="max-w-3xl mx-auto bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8">
      <h2 className="text-2xl font-bold flex items-center gap-3 mb-6">
        <Layers className="h-6 w-6 text-primary" /> Configuración del módulo
      </h2>
      <label htmlFor="module-title" className="text-xs font-bold text-muted-foreground uppercase mb-2 block">
        Nombre del módulo
      </label>
      <input
        id="module-title"
        type="text"
        defaultValue={module.title}
        maxLength={MAX_TITLE_LENGTH}
        readOnly={readOnly}
        onBlur={saveNameOnBlur(module.title, onRename)}
        className="w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg read-only:opacity-60 read-only:cursor-not-allowed"
      />
      <p className="text-sm text-muted-foreground mt-4">
        Este módulo contiene {resources} {plural(resources, 'recurso', 'recursos')}. Utiliza el panel lateral para
        añadir más contenido.
      </p>
    </div>
  );
}
