import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Cuánto vale una comprobación. Cada una consulta la base y escribe en el disco, y la ruta es
 * pública: quien la pida sin parar recibe la misma respuesta, no una comprobación por petición.
 */
const CHECK_VALIDITY_MS = 10_000;

/**
 * Estado del servicio para la supervisión del alojamiento. Es pública, así que sólo dice si la
 * base responde y si se puede guardar archivos: nada que sirva para conocer el servidor.
 */
@Controller('health')
export class HealthController {
  private recent: { at: number; report: ReturnType<HealthController['probe']> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  check() {
    if (!this.recent || Date.now() - this.recent.at >= CHECK_VALIDITY_MS) {
      this.recent = { at: Date.now(), report: this.probe() };
    }
    return this.recent.report;
  }

  private async probe() {
    const [database, storageWritable] = await Promise.all([this.checkDatabase(), this.storage.isWritable()]);

    return {
      status: database.ok && storageWritable ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: { status: database.ok ? 'ok' : 'error', latencyMs: database.latencyMs },
      storage: { status: storageWritable ? 'ok' : 'error' },
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; latencyMs: number | null }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: null };
    }
  }
}
