import { useMemo, useRef } from 'react';
import { Save, X, FileCode2, AtSign, Plus } from 'lucide-react';
import { parseVariables, variableData } from './preview';
import { toEditable, toTemplate, variableLabelHtml, subjectText } from './visual-editing';
import { FormattingToolbar } from './FormattingToolbar';
import { EmojiPalette } from './EmojiPalette';
import { useConfig } from '@/contexts/ConfigContext';
import { fileUrlFor } from '@/lib/api';
import { sanitizeHTML } from '@/lib/sanitize';
import type { EmailEvent, EmailTemplate } from '@/types/models';

/**
 * Variables cuyo valor decide el servidor según el resultado, no quien edita.
 *
 * No se ofrecen para insertar: quien las pusiera esperaría poder elegir el contenido y no
 * puede. Las que ya estén dentro de una plantilla siguen funcionando igual.
 */
const SYSTEM_FILLED = new Set(['emoji', 'mensaje_aprobacion']);

interface EditorProps {
  event: EmailEvent;
  template: EmailTemplate;
  onSave: (id: number, data: { subject: string; bodyHtml: string }) => void;
  onCancel: () => void;
  saving: boolean;
}

/** Etiqueta de color con la que se presenta una variable. */
function VariableLabel({ variable, size = 'sm' }: { variable: string; size?: 'sm' | 'md' }) {
  const meta = variableData(variable);
  const sizeClasses = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full border ${meta.color} ${sizeClasses} whitespace-nowrap`}
    >
      <AtSign className={size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
      {meta.label}
    </span>
  );
}

/** Pinta el asunto sustituyendo cada `{{variable}}` por su etiqueta. */
function SubjectWithVariables({ text }: { text: string }) {
  // Al partir por una expresión con grupo, las posiciones impares son los nombres de variable.
  const parts = text.split(/\{\{(\w+)\}\}/);

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {parts.map((part, i) =>
        i % 2 === 1 ? <VariableLabel key={i} variable={part} size="sm" /> : part && <span key={i}>{part}</span>,
      )}
    </span>
  );
}

export { SubjectWithVariables, VariableLabel };

export default function TemplateEditor({ event, template, onSave, onCancel, saving }: EditorProps) {
  const body = useRef<HTMLDivElement>(null);
  const subject = useRef<HTMLDivElement>(null);
  /**
   * Dónde estaba el cursor antes de pulsar un botón.
   *
   * Se guarda el punto exacto y no sólo la zona: al pulsar, el foco pasa al botón y el
   * navegador descarta la selección, así que sin esto la variable caía siempre al final
   * del cuerpo aunque se estuviera escribiendo en el asunto.
   */
  const savedCaretRange = useRef<Range | null>(null);
  const { config } = useConfig();
  const logo = fileUrlFor(config?.logoUrl);

  const insertable = parseVariables(event.variables).filter((variable) => !SYSTEM_FILLED.has(variable));

  // El contenido inicial se calcula una sola vez: recalcularlo en cada pulsación
  // reescribiría la zona editable y el cursor saltaría al principio.
  //
  // Se limpia antes de convertir las variables en etiquetas: la plantilla la escribe un
  // administrador y se pinta en su sesión, así que pasa el mismo filtro que el resto del
  // HTML del campus. Los enlaces se dejan como están porque lo pintado se vuelve a guardar.
  const initialBody = useMemo(
    () => toEditable(sanitizeHTML(template.bodyHtml, { linksInNewTab: false }).__html),
    [template.bodyHtml],
  );
  const initialSubject = useMemo(
    () => toEditable(sanitizeHTML(template.subject, { linksInNewTab: false }).__html),
    [template.subject],
  );

  const handleSave = () => {
    onSave(template.id, {
      subject: subject.current ? subjectText(subject.current.innerHTML) : template.subject,
      bodyHtml: body.current ? toTemplate(body.current.innerHTML) : template.bodyHtml,
    });
  };

  /** Anota dónde está el cursor mientras se escribe, para poder volver a ese punto. */
  const saveCaretPosition = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const caretRange = selection.getRangeAt(0);
    const isInside = [subject.current, body.current].some((area) => area?.contains(caretRange.commonAncestorContainer));
    if (isInside) savedCaretRange.current = caretRange.cloneRange();
  };

  /** Devuelve el cursor a donde estaba y ejecuta la orden allí. */
  const atCaret = (action: () => void) => {
    const caretRange = savedCaretRange.current;
    const area =
      caretRange && [subject.current, body.current].find((z) => z?.contains(caretRange.commonAncestorContainer));

    if (!caretRange || !area) {
      body.current?.focus();
      action();
      return;
    }

    (area as HTMLElement).focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caretRange);
    action();
    saveCaretPosition();
  };

  const applyFormat = (command: string) => atCaret(() => document.execCommand(command, false));

  const insertVariable = (variable: string) =>
    atCaret(() => document.execCommand('insertHTML', false, `${variableLabelHtml(variable)}&nbsp;`));

  const insertEmoji = (emoji: string) => atCaret(() => document.execCommand('insertText', false, emoji));

  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full animate-in slide-in-from-bottom-4 duration-300">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-border/30 bg-muted/10 gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Editar plantilla: {event.displayName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground"
            aria-label="Cerrar el editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Zona del editor */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <div
                className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                style={{ background: '#f8fafc' }}
              >
                <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-baseline gap-2">
                  <span className="text-xs font-bold text-slate-500 shrink-0">Asunto:</span>
                  <div
                    ref={subject}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label="Asunto del correo"
                    onKeyUp={saveCaretPosition}
                    onMouseUp={saveCaretPosition}
                    onFocus={saveCaretPosition}
                    // El asunto es una sola línea: el salto se ignora en vez de partirlo.
                    onKeyDown={(keyEvent) => keyEvent.key === 'Enter' && keyEvent.preventDefault()}
                    className="flex-1 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/40 rounded px-1"
                    dangerouslySetInnerHTML={{ __html: initialSubject }}
                  />
                </div>

                <FormattingToolbar onApply={applyFormat} />

                {/* El mismo marco que pone el servidor al enviar: cabecera de la sede,
                    cuerpo y pie. Sólo el cuerpo se puede escribir. */}
                <div className="p-6 overflow-y-auto max-h-[46vh]">
                  <div
                    className="mx-auto overflow-hidden"
                    style={{
                      maxWidth: 560,
                      background: '#ffffff',
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    }}
                  >
                    <div style={{ background: config?.primaryColor ?? '#4f46e5', padding: '28px 32px' }}>
                      {logo ? (
                        <img src={logo} alt="" style={{ maxHeight: 40, verticalAlign: 'middle' }} />
                      ) : (
                        <h1 style={{ color: '#ffffff', fontSize: 18, margin: 0, fontWeight: 700 }}>
                          {config?.platformName ?? 'PESV Education'}
                        </h1>
                      )}
                    </div>

                    <div
                      ref={body}
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-multiline="true"
                      aria-label="Cuerpo del correo"
                      onKeyUp={saveCaretPosition}
                      onMouseUp={saveCaretPosition}
                      onFocus={saveCaretPosition}
                      className="outline-none focus:ring-2 focus:ring-primary/40 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6"
                      style={{ padding: 32, color: '#1e293b', minHeight: 180 }}
                      dangerouslySetInnerHTML={{ __html: initialBody }}
                    />

                    <div
                      style={{
                        padding: '20px 32px',
                        background: '#f8fafc',
                        borderTop: '1px solid #e2e8f0',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
                        Correo automático de {config?.platformName ?? 'PESV Education'}. No respondas a este mensaje.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Las etiquetas de colores son los datos que el sistema rellena al enviar; se borran de una pieza. La
                cabecera y el pie los pone el servidor y no se editan aquí.
              </p>
            </div>
          </div>
        </div>

        {/* Lateral: las variables que se pueden insertar */}
        <div className="w-full md:w-80 border-l border-border/30 bg-muted/10 p-6 overflow-y-auto flex flex-col">
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <AtSign className="h-4 w-4" /> Datos automáticos
            </h3>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-foreground mb-1 font-bold">¿Cómo funcionan?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Haz clic en una etiqueta para insertarla en el cuerpo del correo. Al enviar, el sistema reemplaza cada
                etiqueta con la información real del destinatario.
              </p>
            </div>
            <div className="space-y-2">
              {insertable.map((variable) => {
                const meta = variableData(variable);
                return (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="w-full text-left p-3 bg-card border border-border/50 rounded-xl hover:border-primary hover:bg-primary/5 transition-all group flex items-center gap-3 shadow-sm hover:shadow"
                  >
                    <VariableLabel variable={variable} size="md" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-muted-foreground block truncate">Ej: {meta.example}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                      <Plus className="h-3 w-3" /> Insertar
                    </span>
                  </button>
                );
              })}

              <EmojiPalette onSelect={insertEmoji} />
            </div>
          </div>
        </div>
      </div>

      {/* Pie */}
      <div className="p-6 border-t border-border/30 bg-muted/5 flex items-center justify-end gap-3 mt-auto">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 rounded-xl font-bold text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
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
