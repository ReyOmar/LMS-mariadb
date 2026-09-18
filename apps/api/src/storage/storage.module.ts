import { Module, forwardRef } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

// La referencia diferida rompe el ciclo con configuración: el almacenamiento necesita
// saber el límite de subida de la sede y la configuración necesita borrar los archivos
// que reemplaza.
@Module({
  imports: [forwardRef(() => ConfiguracionModule)],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
