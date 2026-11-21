import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { FileOwnershipService } from './file-ownership.service';

/**
 * Guardar, firmar y retirar archivos. No depende de ningún otro módulo de la aplicación: lo usan
 * los que guardan algo (cursos, entregas, certificados, la configuración de la sede…).
 */
@Module({
  providers: [StorageService, FileOwnershipService],
  exports: [StorageService, FileOwnershipService],
})
export class StorageModule {}
