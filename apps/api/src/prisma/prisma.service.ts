import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const dbUrl = new URL(process.env.DATABASE_URL!);
    const adapter = new PrismaMariaDb({
      host: dbUrl.hostname || '127.0.0.1',
      port: dbUrl.port ? parseInt(dbUrl.port) : 3306,
      user: decodeURIComponent(dbUrl.username) || 'root',
      password: decodeURIComponent(dbUrl.password) || '',
      database: dbUrl.pathname.replace(/^\//, '') || 'lms_db',
      connectionLimit: 10,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
