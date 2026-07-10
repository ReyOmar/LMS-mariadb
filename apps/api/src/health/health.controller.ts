import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Health check endpoint for monitoring and load balancers.
   * Returns database connectivity, memory usage, uptime, and environment info.
   */
  @Public()
  @Get()
  async check() {
    let dbStatus = 'ok';
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    const mem = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    return {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        human: this.formatUptime(uptimeSeconds),
      },
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      memory: {
        rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      },
      environment: process.env.NODE_ENV || 'development',
      storage: this.configService.get('R2_ACCOUNT_ID') ? 'cloudflare-r2' : 'local',
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }
}
