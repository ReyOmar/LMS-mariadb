import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { poolSettings, readPoolSize } from './pool-settings';

/**
 * Cliente de Prisma contra MariaDB.
 *
 * Prisma 7 no abre la conexión por sí mismo: se le pasa un adaptador, y el de MariaDB
 * recibe los datos sueltos en lugar de una URL. De ahí que aquí se desmonte
 * `DATABASE_URL` en piezas. Si esa variable falta o está mal escrita, el proceso no
 * arranca y dice qué se esperaba, en lugar de un `TypeError: Invalid URL` sin contexto.
 *
 * Los límites del pool están en `pool-settings.ts`; el tamaño se ajusta con
 * `DATABASE_POOL_SIZE`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: new PrismaMariaDb(PrismaService.connectionData()) });
  }

  private static connectionData() {
    const url = process.env.DATABASE_URL;

    if (!url) {
      this.abort('Falta DATABASE_URL.');
    }

    let parts: URL;
    try {
      parts = new URL(url);
    } catch {
      // Sin repetir el valor: lleva la contraseña de la base y acabaría en el registro.
      this.abort('DATABASE_URL no es una dirección válida.');
    }

    const database = parts.pathname.replace(/^\//, '');
    if (!database) {
      this.abort('DATABASE_URL no indica ninguna base de datos.');
    }

    const pool = readPoolSize(process.env.DATABASE_POOL_SIZE);
    if (pool.warning) this.logger.warn(pool.warning);

    return {
      host: parts.hostname || '127.0.0.1',
      port: parts.port ? Number(parts.port) : 3306,
      user: decodeURIComponent(parts.username) || 'root',
      password: decodeURIComponent(parts.password),
      database,
      ...poolSettings(pool.size),
    };
  }

  private static abort(reason: string): never {
    this.logger.error(reason);
    this.logger.error('Formato esperado: mysql://usuario:contrasena@servidor:3306/nombre_base');
    process.exit(1);
  }

  /**
   * Se intenta conectar al arrancar, pero un fallo aquí no tumba el proceso: la API sigue
   * en pie respondiendo `degraded` en `/api/health`, que es lo que permite diagnosticar el
   * problema desde fuera en vez de encontrarse un servicio que no levanta.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      PrismaService.logger.error('No se pudo conectar con la base de datos al arrancar.', error);
      PrismaService.logger.warn('La API arranca igualmente; /api/health informará del estado.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
