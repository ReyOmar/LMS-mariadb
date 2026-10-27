'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useDialog } from '@/hooks/useDialog';
import type { IssuedIntegrationKey } from '@/types/models';

/**
 * La clave recién generada. Es la única vez que se ve: el servidor sólo guarda su resumen, así que
 * si se pierde hay que generar otra.
 */
export function IssuedKeyDialog({ issued, onClose }: { issued: IssuedIntegrationKey; onClose: () => void }) {
  const { dialogProps, titleId } = useDialog({ onClose });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles se puede seleccionar a mano: el texto está a la vista.
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        {...dialogProps}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3 id={titleId} className="text-lg font-bold mb-2 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" /> Clave de «{issued.client.name}»
        </h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Cópiala ahora y entrégala por un canal seguro a quien administra ese sistema.{' '}
          <strong className="text-foreground">No se volverá a mostrar</strong>: si se pierde, genera otra.
        </p>

        <code className="block w-full break-all select-all rounded-xl border border-border bg-muted px-4 py-3 font-mono text-sm">
          {issued.key}
        </code>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Ya la guardé
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiada' : 'Copiar clave'}
          </button>
        </div>
      </div>
    </div>
  );
}
