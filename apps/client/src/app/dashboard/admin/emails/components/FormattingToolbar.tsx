'use client';

import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Formatos que puede aplicar quien edita un correo.
 *
 * La lista es corta a propósito. Un correo que llega bien a todos los gestores admite poco
 * más que esto, y cada opción de más es una forma nueva de que la plantilla se vea rara en
 * el cliente de correo de alguien.
 */
const FORMATS: { command: string; label: string; icon: LucideIcon }[] = [
  { command: 'bold', label: 'Negrita', icon: Bold },
  { command: 'italic', label: 'Cursiva', icon: Italic },
  { command: 'insertUnorderedList', label: 'Lista con viñetas', icon: List },
  { command: 'insertOrderedList', label: 'Lista numerada', icon: ListOrdered },
];

export function FormattingToolbar({ onApply }: { onApply: (command: string) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
      {FORMATS.map(({ command, label, icon: Icon }) => (
        <button
          key={command}
          type="button"
          title={label}
          aria-label={label}
          // `mousedown` y no `click`: al pulsar, el foco saldría del texto y se perdería la
          // selección sobre la que hay que aplicar el formato.
          onMouseDown={(event) => {
            event.preventDefault();
            onApply(command);
          }}
          // Desde el teclado (Intro o Espacio) sólo llega el `click`, con `detail` a cero.
          onClick={(event) => {
            if (event.detail === 0) onApply(command);
          }}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
