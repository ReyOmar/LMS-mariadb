import { Module } from '@nestjs/common';
import { EventsListener } from './events.listener';
import { CertificatesModule } from '../../certificates/certificates.module';

/**
 * Manejadores de los eventos de dominio.
 * Se aíslan en su propio módulo para que la dependencia con certificados quede en un solo
 * sitio en lugar de arrastrarla hasta el módulo raíz.
 */
@Module({
  imports: [CertificatesModule],
  providers: [EventsListener],
})
export class ListenersModule {}
