import { Module } from '@nestjs/common';
import { EventsListener } from './events.listener';
import { CertificatesModule } from '../../certificates/certificates.module';
import { IntegrationsModule } from '../../integrations/integrations.module';

/**
 * Manejadores de los eventos de dominio.
 * Se aíslan en su propio módulo para que la dependencia con certificados y con la integración
 * quede en un solo sitio en lugar de arrastrarla hasta el módulo raíz.
 */
@Module({
  imports: [CertificatesModule, IntegrationsModule],
  providers: [EventsListener],
})
export class ListenersModule {}
