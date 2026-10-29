'use client';

import { FormEvent, useState } from 'react';
import { BellRing, Loader2, Send } from 'lucide-react';
import { useDialog } from '@/hooks/useDialog';
import { INPUT_CLASS } from '@/components/ui/FormFields';
import type { CallbackTest, IntegrationClient } from '@/types/models';

/** Lo que admite la API para la dirección de avisos. */
const MAX_URL_LENGTH = 500;

interface Props {
  client: IntegrationClient;
  busy: boolean;
  onSave: (url: string | null) => Promise<void>;
  /** @returns Lo que contestó la prueba, o `null` si no se pudo hacer. */
  onTest: () => Promise<CallbackTest | null>;
  onClose: () => void;
}

/**
 * La dirección a la que se avisa a un sistema de los cambios en sus solicitudes, y una prueba de que
 * los avisos le llegan. Vacía, deja de recibirlos y tendrá que consultar el estado. Sigue abierta al
 * guardar, para probar enseguida la dirección nueva.
 */
export function CallbackDialog({ client, busy, onSave, onTest, onClose }: Props) {
  const { dialogProps, titleId } = useDialog<HTMLFormElement>({ onClose });
  const [url, setUrl] = useState(client.callbackUrl ?? '');
  const [test, setTest] = useState<CallbackTest | null>(null);
  const changed = url.trim() !== (client.callbackUrl ?? '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(url.trim() || null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form
        {...dialogProps}
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3 id={titleId} className="text-lg font-bold mb-2 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" /> Avisos a «{client.name}»
        </h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Cuando cambie una de sus solicitudes —la persona quedó matriculada, terminó el curso o la dieron de baja—, el
          campus se lo avisa a esta dirección, firmado con su clave. Sin dirección, el sistema tendrá que consultar el
          estado.
        </p>

        <label htmlFor="callback-url" className="block text-sm font-bold mb-1.5">
          Dirección de avisos
        </label>
        <input
          id="callback-url"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setTest(null);
          }}
          maxLength={MAX_URL_LENGTH}
          placeholder="https://pesv.ejemplo.com/avisos-campus"
          className={INPUT_CLASS}
        />
        {test && (
          <p
            role="status"
            className={`mt-3 text-sm font-semibold ${test.delivered ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {test.message}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {client.callbackUrl && !changed && (
            <button
              type="button"
              onClick={async () => setTest(await onTest())}
              disabled={busy}
              className="h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors disabled:opacity-50 sm:mr-auto"
            >
              <Send className="h-4 w-4" /> Enviar aviso de prueba
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Cerrar
          </button>
          <button
            type="submit"
            disabled={busy || !changed}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {url.trim() || !client.callbackUrl ? 'Guardar' : 'Quitar la dirección'}
          </button>
        </div>
      </form>
    </div>
  );
}
