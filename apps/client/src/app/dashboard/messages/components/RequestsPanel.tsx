import { CheckCircle, X, XCircle } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { ContactRequest } from '../inbox';

interface Props {
  requests: ContactRequest[];
  isResponding: (requestId: number) => boolean;
  onRespond: (requestId: number, accept: boolean) => void;
  onClose: () => void;
}

/** Solicitudes de conversación recibidas, para aceptarlas o rechazarlas. */
export function RequestsPanel({ requests, isResponding, onRespond, onClose }: Props) {
  return (
    <section
      aria-label="Solicitudes pendientes"
      className="p-3 border-b border-border bg-amber-500/5 max-h-64 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
          Solicitudes pendientes
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-lg"
          aria-label="Cerrar solicitudes"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <ul className="space-y-2">
        {requests.map((request) => (
          <li key={request.id} className="flex items-center gap-3 p-3 bg-card border border-border/50 rounded-xl">
            {request.requester && <UserAvatar person={request.requester} role={request.requester.role} tone="tint" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">
                {request.requester
                  ? `${request.requester.firstName} ${request.requester.lastName}`
                  : 'Cuenta ya no disponible'}
              </p>
              <p className="text-[10px] text-muted-foreground">Quiere conversar contigo</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onRespond(request.id, true)}
                disabled={isResponding(request.id)}
                className="p-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                title="Aceptar"
                aria-label="Aceptar la solicitud"
              >
                <CheckCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onRespond(request.id, false)}
                disabled={isResponding(request.id)}
                className="p-1.5 bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                title="Rechazar"
                aria-label="Rechazar la solicitud"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
