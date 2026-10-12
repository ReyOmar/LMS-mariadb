'use client';

import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { keepingSelection } from './keep-selection';

/** Pocos formatos a propósito: cada uno de más es otra forma de que el correo se vea mal en algún gestor. */
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
          {...keepingSelection(() => onApply(command))}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
