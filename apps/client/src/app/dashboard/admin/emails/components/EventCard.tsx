import { Edit3, Lock, Power } from 'lucide-react';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import { eventCategory } from './categories';
import { parseVariables } from './variables';
import { SubjectWithVariables, VariableLabel } from './VariableLabel';

interface Props {
  event: EmailEvent;
  isToggling: (templateId: number) => boolean;
  onEdit: (template: EmailTemplate) => void;
  onToggleActive: (template: EmailTemplate) => void;
}

export function EventCard({ event, isToggling, onEdit, onToggleActive }: Props) {
  const category = eventCategory(event.key);
  const sending = event.templates.some((template) => template.active);

  return (
    <div
      className={`bg-card border rounded-2xl shadow-sm flex flex-col transition-all hover:shadow-md ${
        sending ? 'border-border/50' : 'border-red-500/20'
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`h-10 w-10 ${category.backgroundColor} rounded-xl flex items-center justify-center shrink-0`}>
            <category.icon className={`h-5 w-5 ${category.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm sm:text-base leading-tight">{event.displayName}</h3>
            <span
              className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${category.backgroundColor} ${category.color}`}
            >
              <category.icon className="h-2.5 w-2.5" /> {category.label}
            </span>
          </div>
          <div
            className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 shadow-sm ${
              sending ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-red-500 shadow-red-500/50'
            }`}
            title={sending ? 'Activo' : 'Inactivo'}
          />
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">{event.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {parseVariables(event.variables).map((variable) => (
            <VariableLabel key={variable} variable={variable} />
          ))}
        </div>
      </div>

      <div className="border-t border-border/30 p-3 sm:p-4 bg-muted/5 rounded-b-2xl space-y-2">
        {event.templates.length === 0 ? (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs font-bold text-center">
            No hay plantillas para este evento.
          </div>
        ) : (
          event.templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              essential={event.essential}
              toggling={isToggling(template.id)}
              onEdit={() => onEdit(template)}
              onToggleActive={() => onToggleActive(template)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TemplateRowProps {
  template: EmailTemplate;
  essential: boolean;
  toggling: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}

function TemplateRow({ template, essential, toggling, onEdit, onToggleActive }: TemplateRowProps) {
  const toggleLabel = template.active ? 'Desactivar envío' : 'Activar envío';

  return (
    <div className="flex items-center justify-between p-2.5 sm:p-3 bg-card border border-border/30 rounded-xl gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-xs sm:text-sm truncate">
          <SubjectWithVariables text={template.subject} />
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">{template.internalName}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-2 bg-card hover:bg-muted border border-border/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          title="Editar plantilla"
          aria-label={`Editar plantilla ${template.internalName}`}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        {essential ? (
          <span
            role="img"
            className="p-2 border border-border/50 rounded-lg text-muted-foreground flex items-center justify-center"
            title="Imprescindible para entrar al campus: se puede editar, pero no desactivar"
            aria-label={`${template.internalName}: imprescindible, no se puede desactivar`}
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleActive}
            disabled={toggling}
            title={toggleLabel}
            aria-label={`${toggleLabel} de ${template.internalName}`}
            className={`p-2 border rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none ${
              template.active
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20'
                : 'bg-muted border-border/50 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
