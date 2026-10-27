'use client';

import { Clock, Info, Plug } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SectionCard } from '@/components/ui/SectionCard';
import { useIntegrations } from './useIntegrations';
import { WaitingCourses } from './components/WaitingCourses';
import { ConnectedSystems } from './components/ConnectedSystems';
import { IssuedKeyDialog } from './components/IssuedKeyDialog';
import { ConnectionGuide } from './components/ConnectionGuide';

/**
 * Interoperabilidad de la sede: otros sistemas, como el del PESV, matriculan aquí a quien tiene que
 * hacer un curso y consultan cuándo lo termina.
 */
export default function IntegrationsPage() {
  const integrations = useIntegrations();
  const { clients, waiting, issued } = integrations;

  if (clients.loading || waiting.loading) return <PageLoader message="Cargando integraciones..." />;

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 space-y-6">
      <header>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
          <Plug className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Integraciones
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Otros sistemas, como el del PESV, matriculan aquí a quien tiene que hacer un curso y consultan cuándo lo
          termina.
        </p>
      </header>

      <SectionCard icon={Clock} title="Matrículas en espera">
        {waiting.error ? (
          <LoadFailed message={waiting.error} onRetry={waiting.retry} />
        ) : (
          <WaitingCourses
            courses={waiting.data ?? []}
            isBusy={integrations.isBusy}
            onDiscard={(course, request) => void integrations.discard(course, request)}
          />
        )}
      </SectionCard>

      <SectionCard icon={Plug} title="Sistemas conectados">
        {clients.error ? (
          <LoadFailed message={clients.error} onRetry={clients.retry} />
        ) : (
          <ConnectedSystems
            clients={clients.data ?? []}
            isBusy={integrations.isBusy}
            onConnect={integrations.connect}
            onRenewKey={(client) => void integrations.renewKey(client)}
            onRevokeKey={(client) => void integrations.revokeKey(client)}
          />
        )}
      </SectionCard>

      <SectionCard icon={Info} title="Cómo se conecta un sistema">
        <ConnectionGuide />
      </SectionCard>

      {issued && <IssuedKeyDialog issued={issued} onClose={integrations.closeIssued} />}
    </div>
  );
}
