import { Module } from '@nestjs/common';
import { CertificadosController } from './certificados.controller';
import { CertificadosService } from './certificados.service';
import { CursosModule } from '../cursos/cursos.module';
import { StorageModule } from '../storage/storage.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [CursosModule, StorageModule, ConfiguracionModule],
  controllers: [CertificadosController],
  providers: [CertificadosService],
  exports: [CertificadosService],
})
export class CertificadosModule {}
