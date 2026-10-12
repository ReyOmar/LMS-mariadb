'use client';

import { useState } from 'react';
import { Check, ShieldAlert } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import type { AccessRequest } from '@/types/models';
import { plural } from '@/lib/text';
import { RejectRequestDialog } from './components/RejectRequestDialog';
import { RequestList } from './components/RequestList';
import { useAccessRequests } from './useAccessRequests';

export default function AccessRequestsPage() {
  const { requests, loading, error, retry, isProcessing, approve, reject } = useAccessRequests();
  const [rejecting, setRejecting] = useState<AccessRequest | null>(null);

  if (loading) return <PageLoader message="Cargando solicitudes..." />;

  const confirmReject = (reason: string) => {
    if (!rejecting) return;
    setRejecting(null);
    void reject(rejecting, reason);
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <ShieldAlert className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Solicitudes de acceso{' '}
          {!error && (
            <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold">
              {requests.length} {plural(requests.length, 'pendiente', 'pendientes')}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Revisa y valida a mano las solicitudes de registro.{' '}
          <span className="hidden sm:inline">
            Al aprobar, la persona recibe por correo una contraseña temporal propia que debe cambiar al entrar.
          </span>
        </p>
      </header>

      {error ? (
        <LoadFailed message={error} onRetry={retry} />
      ) : requests.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <Check className="h-16 w-16 text-emerald-500 mb-4 opacity-50" />
          <h3 className="text-xl font-bold">Bandeja limpia</h3>
          <p className="text-muted-foreground mt-2 max-w-md">No hay solicitudes de registro pendientes.</p>
        </div>
      ) : (
        <RequestList
          requests={requests}
          isProcessing={isProcessing}
          onApprove={(request) => void approve(request)}
          onReject={setRejecting}
        />
      )}

      {rejecting && (
        <RejectRequestDialog request={rejecting} onCancel={() => setRejecting(null)} onConfirm={confirmReject} />
      )}
    </div>
  );
}
