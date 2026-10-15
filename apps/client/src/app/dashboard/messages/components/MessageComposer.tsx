'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useInFlight } from '@/hooks/useInFlight';
import { MAX_MESSAGE_LENGTH } from '../inbox';

/**
 * Campo para escribir en la conversación abierta. Intro envía y Mayús + Intro salta de línea.
 *
 * @param onSend Devuelve si se envió: sólo entonces se vacía el campo.
 */
export function MessageComposer({ onSend }: { onSend: (content: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState('');
  const sending = useInFlight<'message'>();
  const busy = sending.has('message');
  const content = draft.trim();

  const send = () =>
    sending.run('message', async () => {
      if (content && (await onSend(content))) setDraft('');
    });

  return (
    <div className="p-3 sm:p-4 border-t border-border/50 shrink-0">
      <div className="flex items-end gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          aria-label="Mensaje"
          aria-describedby="message-length"
          placeholder="Escribe un mensaje…"
          // Sólo lectura y no deshabilitado: así no pierde el foco y se puede seguir escribiendo al enviar.
          readOnly={busy}
          className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 min-h-[44px] max-h-40 field-sizing-content resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm read-only:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!content || busy}
          aria-label="Enviar mensaje"
          className="h-11 w-11 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p id="message-length" className="text-[10px] text-muted-foreground mt-1.5 flex justify-between gap-3">
        <span className="hidden sm:inline">Mayús + Intro para saltar de línea.</span>
        <span className="ml-auto">
          {draft.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </p>
    </div>
  );
}
