import { Global, Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

/**
 * Tiempo real del LMS. Es global porque casi todos los módulos de dominio necesitan
 * notificar cambios, y declararlo en cada `imports` sólo añadía ruido.
 */
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
