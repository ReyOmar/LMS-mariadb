import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationAdminController } from './integration-admin.controller';
import { IntegrationClientsService } from './integration-clients.service';
import { IntegrationKeyGuard } from './integration-auth';
import { ExternalEnrollmentsService } from './external-enrollments.service';
import { WaitingRequestsService } from './waiting-requests.service';
import { WaitingReminders } from './waiting-reminders';
import { InfractionsService } from './infractions.service';
import { IntegrationCourses } from './integration-courses';
import { IntegrationViews } from './integration-views';
import { IntegrationWebhooks } from './integration-webhooks';

/**
 * Interoperabilidad: otros sistemas, como el del PESV, piden que una persona haga el curso de una
 * infracción, y el campus les avisa cuando lo termina. Reutiliza el alta de cuentas y las matrículas
 * del campus: una matrícula externa sigue exactamente las mismas reglas que una hecha desde el panel.
 */
@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [IntegrationApiController, IntegrationAdminController],
  providers: [
    IntegrationClientsService,
    IntegrationKeyGuard,
    ExternalEnrollmentsService,
    WaitingRequestsService,
    WaitingReminders,
    InfractionsService,
    IntegrationCourses,
    IntegrationViews,
    IntegrationWebhooks,
  ],
  exports: [WaitingRequestsService, IntegrationWebhooks],
})
export class IntegrationsModule {}
