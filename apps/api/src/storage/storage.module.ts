import { Module, forwardRef } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { FileOwnershipService } from './file-ownership.service';
import { SettingsModule } from '../settings/settings.module';

// El almacenamiento necesita el límite de subida de la sede y la configuración retira los
// archivos que sustituye: la referencia diferida rompe ese ciclo.
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [StorageController],
  providers: [StorageService, FileOwnershipService],
  exports: [StorageService, FileOwnershipService],
})
export class StorageModule {}
