import { Module } from '@nestjs/common';
import { EvaluacionesController } from './evaluaciones.controller';
import { EvaluacionesService } from './evaluaciones.service';
import { CursosModule } from '../cursos/cursos.module';
import { StorageModule } from '../storage/storage.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [CursosModule, StorageModule, ConfiguracionModule],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
  exports: [EvaluacionesService],
})
export class EvaluacionesModule {}
