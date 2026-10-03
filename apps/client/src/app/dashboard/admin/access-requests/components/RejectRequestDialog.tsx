'use client';

import { FormEvent, useState } from 'react';
import { useDialog } from '@/hooks/useDialog';
import type { AccessRequest } from '@/types/models';

/** El mismo tope que admite la API. */
const MAX_REASON_LENGTH = 500;

interface Props {
  request: AccessRequest;
  onCancel: () => void;
  /** Recibe el motivo ya recortado; vacío si no se escribió ninguno. */
  onConfirm: (reason: string) => void;
}

/**
 * Rechazo de una solicitud de acceso, con un motivo opcional.
 *
 * La persona recibe la decisión por correo, y el motivo va en él: un rechazo sin
 * explicación sólo deja la duda de si volver a intentarlo.
 */
export function RejectRequestDialog({ request, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const { dialogProps, titleId } = useDialog<HTMLFormElement>({ onClose: onCancel });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(reason.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <form
        {...dialogProps}
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3 id={titleId} className="text-lg font-bold mb-2">
          Rechazar la solicitud de {request.firstName} {request.lastName}
        </h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Le enviaremos la decisión a <strong className="text-foreground">{request.email}</strong>. Si escribes el
          motivo, irá en el correo.
        </p>

        <label
          htmlFor="reject-reason"
          className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
        >
          Motivo (opcional)
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={MAX_REASON_LENGTH}
          rows={4}
          placeholder="Por ejemplo: el correo no pertenece a ninguna empresa con la que trabajemos."
          className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
        />
        <p className="text-[10px] text-muted-foreground text-right mt-1">
          {reason.length}/{MAX_REASON_LENGTH}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="h-10 rounded-xl bg-destructive px-5 text-sm font-bold text-white hover:bg-destructive/90 transition-colors"
          >
            Rechazar
          </button>
        </div>
      </form>
    </div>
  );
}
