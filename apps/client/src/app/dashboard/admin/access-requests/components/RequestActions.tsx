import { Check, X } from 'lucide-react';
import type { AccessRequest } from '@/types/models';

interface Props {
  request: AccessRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  iconsOnly?: boolean;
}

export function RequestActions({ request, busy, onApprove, onReject, iconsOnly = false }: Props) {
  const name = `${request.firstName} ${request.lastName}`;
  const size = iconsOnly ? 'p-2' : 'px-3 py-1.5 text-xs font-bold flex items-center gap-1';
  const icon = iconsOnly ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        title="Aprobar"
        aria-label={`Aprobar la solicitud de ${name}`}
        className={`bg-success hover:bg-success/90 text-success-foreground rounded-lg transition-colors disabled:opacity-50 ${size}`}
      >
        <Check className={icon} />
        {!iconsOnly && 'Aprobar'}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        title="Rechazar"
        aria-label={`Rechazar la solicitud de ${name}`}
        className={`bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-colors disabled:opacity-50 ${size}`}
      >
        <X className={icon} />
        {!iconsOnly && 'Rechazar'}
      </button>
    </div>
  );
}
