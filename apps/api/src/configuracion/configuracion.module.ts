import { Module, forwardRef } from '@nestjs/common';
import { ConfiguracionService } from './configuracion.service';
import { ConfiguracionController } from './configuracion.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [forwardRef(() => StorageModule)],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
