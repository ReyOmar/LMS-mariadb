import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationAdminController } from './integration-admin.controller';
import { IntegrationClientsService } from './integration-clients.service';
import { IntegrationKeyGuard } from './integration-auth';
import { ExternalEnrollmentsService } from './external-enrollments.service';

/**
 * Interoperabilidad: otros sistemas, como el del PESV, piden matricular a una persona en un curso
 * y consultan si lo terminó. Reutiliza el alta de cuentas y las matrículas del campus: una
 * matrícula externa sigue exactamente las mismas reglas que una hecha desde el panel.
 */
@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [IntegrationApiController, IntegrationAdminController],
  providers: [IntegrationClientsService, IntegrationKeyGuard, ExternalEnrollmentsService],
  exports: [ExternalEnrollmentsService],
})
export class IntegrationsModule {}
