import { Module, forwardRef } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { SettingsModule } from '../settings/settings.module';

// La referencia diferida rompe el ciclo con configuración: el almacenamiento necesita
// saber el límite de subida de la sede y la configuración necesita borrar los archivos
// que reemplaza.
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
