import { Module } from '@nestjs/common';
import { LmsEventListener } from './lms-event.listener';
import { CertificadosModule } from '../../certificados/certificados.module';

/**
 * Manejadores de los eventos de dominio.
 * Se aíslan en su propio módulo para que la dependencia con certificados quede en un solo
 * sitio en lugar de arrastrarla hasta el módulo raíz.
 */
@Module({
  imports: [CertificadosModule],
  providers: [LmsEventListener],
})
export class ListenersModule {}
