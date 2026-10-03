'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Clock, ShieldAlert } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { AccessRequest, UserRole } from '@/types/models';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { shortDate } from '@/lib/dates';
import { plural } from '@/lib/text';

const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: 'bg-red-500/10 text-red-700 dark:text-red-400',
  TEACHER: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  STUDENT: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const { showAlert, showConfirmation } = useAlerts();

  const loadAccessRequests = useCallback(async () => {
    try {
      const { data } = await api.get<AccessRequest[]>('/auth/access-requests');
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      showAlert.error('No se pudo cargar', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    void loadAccessRequests();
  }, [loadAccessRequests]);

  useRealtimeEvent('request:new', loadAccessRequests);
  useRealtimeEvent('request:resolved', loadAccessRequests);

  const resolveRequest = async (request: AccessRequest, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const confirmed = await showConfirmation(
        `¿Rechazar la solicitud de ${request.firstName} ${request.lastName}?`,
        'El solicitante no podrá acceder con este correo.',
        'Rechazar',
      );
      if (!confirmed) return;
    }

    const id = request.id;
    setProcessing(id);
    try {
      await api.post(`/auth/access-requests/${id}/${action}`, {});
      setRequests((prev) => prev.filter((item) => item.id !== id));
      showAlert.success(
        action === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada',
        action === 'approve'
          ? 'La cuenta se creó y el usuario recibirá un correo con su contraseña temporal.'
          : 'El solicitante no podrá acceder con este correo.',
      );
    } catch (error) {
      showAlert.error('No se pudo procesar', errorMessage(error));
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <ShieldAlert className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Solicitudes de acceso{' '}
          <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold">
            {requests.length} {plural(requests.length, 'pendiente', 'pendientes')}
          </span>
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Revisa y valida a mano las solicitudes de registro.{' '}
          <span className="hidden sm:inline">
            Al aprobar, la persona recibe por correo una contraseña temporal propia que debe cambiar al entrar.
          </span>
        </p>
      </header>

      {/* ===== TABLA DE SOLICITUDES ===== */}
      {loading ? (
        <PageLoader message="Cargando solicitudes..." />
      ) : requests.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <Check className="h-16 w-16 text-emerald-500 mb-4 opacity-50" />
          <h3 className="text-xl font-bold">Bandeja limpia</h3>
          <p className="text-muted-foreground mt-2 max-w-md">No hay solicitudes de registro pendientes.</p>
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
          {/* Tabla en escritorio */}
          <table className="hidden lg:table w-full text-left text-sm">
            <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Correo</th>
                <th className="px-6 py-4">Rol solicitado</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4 font-bold">
                    {req.firstName} {req.lastName}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{req.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                        ${ROLE_BADGE[req.requestedRole]}
                    `}
                    >
                      {USER_ROLE_LABEL[req.requestedRole]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {shortDate(req.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => resolveRequest(req, 'approve')}
                      disabled={processing === req.id}
                      className="bg-success hover:bg-success/90 text-success-foreground p-2 rounded-lg transition-colors disabled:opacity-50"
                      title="Aprobar"
                      aria-label={`Aprobar la solicitud de ${req.firstName} ${req.lastName}`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveRequest(req, 'reject')}
                      disabled={processing === req.id}
                      className="bg-destructive hover:bg-destructive/90 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                      title="Rechazar"
                      aria-label={`Rechazar la solicitud de ${req.firstName} ${req.lastName}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Vista de tarjetas en móvil */}
          <div className="lg:hidden divide-y divide-border/30">
            {requests.map((req) => (
              <div key={req.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">
                      {req.firstName} {req.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{req.email}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ml-2
                      ${ROLE_BADGE[req.requestedRole]}
                  `}
                  >
                    {USER_ROLE_LABEL[req.requestedRole]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {shortDate(req.createdAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => resolveRequest(req, 'approve')}
                      disabled={processing === req.id}
                      className="bg-success hover:bg-success/90 text-success-foreground px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveRequest(req, 'reject')}
                      disabled={processing === req.id}
                      className="bg-destructive hover:bg-destructive/90 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 text-xs font-bold flex items-center gap-1"
                    >
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
