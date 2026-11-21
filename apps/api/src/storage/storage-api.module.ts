import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageModule } from './storage.module';
import { SettingsModule } from '../settings/settings.module';

/**
 * Las rutas de subida y descarga. Van aparte del almacenamiento porque necesitan el límite de
 * subida de la sede, y la configuración de la sede guarda a su vez archivos: en un solo módulo,
 * cada uno dependería del otro.
 */
@Module({
  imports: [StorageModule, SettingsModule],
  controllers: [StorageController],
})
export class StorageApiModule {}
