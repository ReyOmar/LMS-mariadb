'use client';

import { Info, Plug, TrafficCone } from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SectionCard } from '@/components/ui/SectionCard';
import { useIntegrations } from './useIntegrations';
import { Infractions } from './components/Infractions';
import { ConnectedSystems } from './components/ConnectedSystems';
import { IssuedKeyDialog } from './components/IssuedKeyDialog';
import { CallbackDialog } from './components/CallbackDialog';
import { ConnectionGuide } from './components/ConnectionGuide';

/**
 * Interoperabilidad de la sede: otros sistemas, como el del PESV, piden aquí que una persona haga el
 * curso de una infracción, y el campus les avisa cuando lo termina. El curso de cada infracción lo
 * busca el campus por su título; si no lo encuentra, lo elige el administrador una sola vez.
 */
export default function IntegrationsPage() {
  const integrations = useIntegrations();
  const { clients, infractions, courses, issued, callbackOf } = integrations;

  if (clients.loading || infractions.loading || courses.loading) {
    return <PageLoader message="Cargando integraciones..." />;
  }

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 space-y-6">
      <header>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
          <Plug className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Integraciones
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Otros sistemas, como el del PESV, piden que una persona haga el curso de una infracción, y el campus les avisa
          cuando lo termina. El curso de cada infracción se busca por su título; si no se encuentra, lo eliges tú una
          vez.
        </p>
      </header>

      <SectionCard icon={TrafficCone} title="Infracciones y cursos">
        {infractions.error || courses.error ? (
          <LoadFailed
            message={infractions.error ?? courses.error ?? ''}
            onRetry={() => {
              infractions.retry();
              courses.retry();
            }}
          />
        ) : (
          <Infractions
            infractions={infractions.data ?? []}
            courses={courses.data ?? []}
            isBusy={integrations.isBusy}
            onAssign={(infraction, course) => void integrations.assignCourse(infraction, course)}
            onDiscard={(infraction, request) => void integrations.discard(infraction, request)}
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
            onRemove={(client) => void integrations.removeClient(client)}
            onEditCallback={integrations.editCallback}
          />
        )}
      </SectionCard>

      <SectionCard icon={Info} title="Cómo se conecta un sistema">
        <ConnectionGuide />
      </SectionCard>

      {issued && <IssuedKeyDialog issued={issued} onClose={integrations.closeIssued} />}
      {callbackOf && (
        <CallbackDialog
          client={callbackOf}
          busy={integrations.isBusy(`client-${callbackOf.id}`)}
          onSave={(url) => integrations.saveCallback(callbackOf, url)}
          onTest={() => integrations.testCallback(callbackOf)}
          onClose={integrations.closeCallback}
        />
      )}
    </div>
  );
}
