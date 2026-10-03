import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Estado del servicio para la supervisión del alojamiento.
 *
 * Es pública, así que sólo dice si la API y la base responden: memoria, entorno o versión
 * no le sirven al monitor y sí a quien quiera conocer el servidor.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const start = Date.now();
    const databaseOk = await this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );

    return {
      status: databaseOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: {
        status: databaseOk ? 'ok' : 'error',
        latencyMs: databaseOk ? Date.now() - start : null,
      },
    };
  }
}
