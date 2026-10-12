import { AtSign, Plus } from 'lucide-react';
import { EmojiPalette } from './EmojiPalette';
import { VariableLabel } from './VariableLabel';
import { variableData } from './variables';

export function VariablePicker({
  variables,
  onInsertVariable,
  onInsertEmoji,
}: {
  variables: string[];
  onInsertVariable: (variable: string) => void;
  onInsertEmoji: (emoji: string) => void;
}) {
  return (
    <div className="flex-1">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
        <AtSign className="h-4 w-4" /> Datos automáticos
      </h3>
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
        <p className="text-xs text-foreground mb-1 font-bold">¿Cómo funcionan?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Haz clic en una etiqueta para insertarla donde tengas el cursor (asunto o cuerpo). Al enviar, el sistema
          reemplaza cada etiqueta con la información real del destinatario.
        </p>
      </div>
      <div className="space-y-2">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => onInsertVariable(variable)}
            className="w-full text-left p-3 bg-card border border-border/50 rounded-xl hover:border-primary hover:bg-primary/5 transition-all group flex items-center gap-3 shadow-sm hover:shadow"
          >
            <VariableLabel variable={variable} size="md" />
            <span className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
              Ej: {variableData(variable).example}
            </span>
            <span className="text-[10px] uppercase font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
              <Plus className="h-3 w-3" /> Insertar
            </span>
          </button>
        ))}

        <EmojiPalette onSelect={onInsertEmoji} />
      </div>
    </div>
  );
}
