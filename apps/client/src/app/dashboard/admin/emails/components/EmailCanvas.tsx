'use client';

import { useMemo, type RefObject } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { fileUrlFor } from '@/lib/api';
import { platformNameOf } from '@/lib/platform';
import { FormattingToolbar } from './FormattingToolbar';

const DEFAULT_PRIMARY = '#4f46e5';

interface Props {
  subjectRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  /** HTML ya saneado y con las variables como etiquetas (`useTemplateEditor`). */
  initialSubject: string;
  initialBody: string;
  onCaretMove: () => void;
  onInput: () => void;
  onFormat: (command: string) => void;
}

/** El correo como lo envía el servidor: cabecera de la sede, cuerpo editable y pie. */
export function EmailCanvas({
  subjectRef,
  bodyRef,
  initialSubject,
  initialBody,
  onCaretMove,
  onInput,
  onFormat,
}: Props) {
  const { config } = useConfig();
  const logo = fileUrlFor(config?.logoUrl);
  const platformName = platformNameOf(config);
  const caretTracking = { onKeyUp: onCaretMove, onMouseUp: onCaretMove, onFocus: onCaretMove, onInput };
  // React vuelve a escribir el HTML cada vez que recibe otro objeto, aunque diga lo mismo: con uno
  // nuevo en cada pintado, la primera tecla devolvería la zona editable a su estado inicial.
  const subjectHtml = useMemo(() => ({ __html: initialSubject }), [initialSubject]);
  const bodyHtml = useMemo(() => ({ __html: initialBody }), [initialBody]);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm" style={{ background: '#f8fafc' }}>
      <div className="border-b border-slate-200 bg-white px-4 py-2 flex items-baseline gap-2">
        <span className="text-xs font-bold text-slate-500 shrink-0">Asunto:</span>
        <div
          ref={subjectRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Asunto del correo"
          {...caretTracking}
          onKeyDown={(keyEvent) => keyEvent.key === 'Enter' && keyEvent.preventDefault()}
          className="flex-1 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/40 rounded px-1"
          dangerouslySetInnerHTML={subjectHtml}
        />
      </div>

      <FormattingToolbar onApply={onFormat} />

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
          <div style={{ background: config?.primaryColor ?? DEFAULT_PRIMARY, padding: '28px 32px' }}>
            {logo ? (
              <img src={logo} alt="" style={{ maxHeight: 40, verticalAlign: 'middle' }} />
            ) : (
              <h1 style={{ color: '#ffffff', fontSize: 18, margin: 0, fontWeight: 700 }}>{platformName}</h1>
            )}
          </div>

          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Cuerpo del correo"
            {...caretTracking}
            className="outline-none focus:ring-2 focus:ring-primary/40 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6"
            style={{ padding: 32, color: '#1e293b', minHeight: 180 }}
            dangerouslySetInnerHTML={bodyHtml}
          />

          <div
            style={{ padding: '20px 32px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}
          >
            <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
              Correo automático de {platformName}. No respondas a este mensaje.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
