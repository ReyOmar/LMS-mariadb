'use client';

import { FileCode2, Save, X } from 'lucide-react';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { parseVariables } from './variables';
import { useTemplateEditor, type TemplateContent } from './useTemplateEditor';
import { EmailCanvas } from './EmailCanvas';
import { VariablePicker } from './VariablePicker';

/** Las rellena el servidor según el resultado: no se ofrecen para insertar, aunque las ya puestas funcionan. */
const SYSTEM_FILLED = new Set(['emoji', 'mensaje_aprobacion']);

interface Props {
  event: EmailEvent;
  template: EmailTemplate;
  onSave: (content: TemplateContent) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export function TemplateEditor({ event, template, onSave, onCancel, saving }: Props) {
  const editor = useTemplateEditor(template);
  const confirmDiscard = useUnsavedChangesGuard(editor.dirty);
  const insertable = parseVariables(event.variables).filter((variable) => !SYSTEM_FILLED.has(variable));

  const cancel = async () => {
    if (!editor.dirty || (await confirmDiscard())) onCancel();
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-border/30 bg-muted/10 gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Editar plantilla: {event.displayName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
        </div>
        <button
          type="button"
          onClick={cancel}
          className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground self-end sm:self-auto"
          aria-label="Cerrar el editor"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        <div className="shrink-0 md:shrink md:flex-1 md:min-h-0 md:overflow-y-auto p-4 sm:p-6">
          <EmailCanvas
            subjectRef={editor.subject}
            bodyRef={editor.body}
            initialSubject={editor.initial.subject}
            initialBody={editor.initial.body}
            onCaretMove={editor.rememberCaret}
            onInput={editor.checkDirty}
            onFormat={editor.applyFormat}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Las etiquetas de colores son los datos que el sistema rellena al enviar; se borran de una pieza. La cabecera
            y el pie los pone el servidor y no se editan aquí.
          </p>
        </div>

        <div className="shrink-0 w-full md:w-80 border-t md:border-t-0 md:border-l border-border/30 bg-muted/10 p-6 md:overflow-y-auto flex flex-col">
          <VariablePicker
            variables={insertable}
            onInsertVariable={editor.insertVariable}
            onInsertEmoji={editor.insertEmoji}
          />
        </div>
      </div>

      <div className="p-4 sm:p-6 border-t border-border/30 bg-muted/5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={cancel}
          className="px-6 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void onSave(editor.read())}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <span className="animate-pulse">Guardando...</span>
          ) : (
            <>
              <Save className="h-4 w-4" /> Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}
