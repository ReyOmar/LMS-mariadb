'use client';

import { Layers } from 'lucide-react';
import type { CourseModule } from '@/types/models';
import { saveNameOnBlur } from './names';

interface Props {
  module: CourseModule;
  readOnly: boolean;
  onRename: (title: string) => void;
}

/** Ajustes de un módulo. Su contenido se ordena y se añade desde el temario. */
export function ModuleSettings({ module, readOnly, onRename }: Props) {
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
        readOnly={readOnly}
        onBlur={saveNameOnBlur(module.title, onRename)}
        className={`w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
      <p className="text-sm text-muted-foreground mt-4">
        Este módulo contiene {module.resources?.length || 0} recursos o tareas. Utiliza el panel lateral para añadir más
        contenido.
      </p>
    </div>
  );
}
