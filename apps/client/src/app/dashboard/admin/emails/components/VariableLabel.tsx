import { AtSign } from 'lucide-react';
import { variableData } from './variables';

export function VariableLabel({ variable, size = 'sm' }: { variable: string; size?: 'sm' | 'md' }) {
  const { color, label } = variableData(variable);
  const sizeClasses = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full border ${color} ${sizeClasses} whitespace-nowrap`}
    >
      <AtSign className={size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
      {label}
    </span>
  );
}

/** El asunto con cada `{{variable}}` pintada como su etiqueta. */
export function SubjectWithVariables({ text }: { text: string }) {
  // Al partir por una expresión con grupo, las posiciones impares son los nombres de variable.
  const parts = text.split(/\{\{(\w+)\}\}/);

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {parts.map((part, index) =>
        index % 2 === 1 ? <VariableLabel key={index} variable={part} /> : part && <span key={index}>{part}</span>,
      )}
    </span>
  );
}
