import { Clock } from 'lucide-react';
import type { AccessRequest, UserRole } from '@/types/models';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { ROLE_STYLE } from '@/lib/role-style';
import { shortDate } from '@/lib/dates';
import { RequestActions } from './RequestActions';

interface Props {
  requests: AccessRequest[];
  isProcessing: (id: number) => boolean;
  onApprove: (request: AccessRequest) => void;
  onReject: (request: AccessRequest) => void;
}

export function RequestList({ requests, isProcessing, onApprove, onReject }: Props) {
  const actionsFor = (request: AccessRequest, iconsOnly: boolean) => (
    <RequestActions
      request={request}
      busy={isProcessing(request.id)}
      onApprove={() => onApprove(request)}
      onReject={() => onReject(request)}
      iconsOnly={iconsOnly}
    />
  );

  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
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
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-muted/10 transition-colors">
              <td className="px-6 py-4 font-bold">
                {request.firstName} {request.lastName}
              </td>
              <td className="px-6 py-4 text-muted-foreground">{request.email}</td>
              <td className="px-6 py-4">
                <RoleBadge role={request.requestedRole} className="px-3 py-1 text-xs" />
              </td>
              <td className="px-6 py-4 text-muted-foreground">
                <RequestDate request={request} />
              </td>
              <td className="px-6 py-4 text-right">{actionsFor(request, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="lg:hidden divide-y divide-border/30">
        {requests.map((request) => (
          <div key={request.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">
                  {request.firstName} {request.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">{request.email}</p>
              </div>
              <RoleBadge role={request.requestedRole} className="px-2.5 py-1 text-[10px] shrink-0 ml-2" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                <RequestDate request={request} />
              </span>
              {actionsFor(request, false)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role, className }: { role: UserRole; className: string }) {
  return (
    <span className={`rounded-full font-bold uppercase tracking-wider ${ROLE_STYLE[role].tint} ${className}`}>
      {USER_ROLE_LABEL[role]}
    </span>
  );
}

function RequestDate({ request }: { request: AccessRequest }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3" /> {shortDate(request.createdAt)}
    </span>
  );
}
