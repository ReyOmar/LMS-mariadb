import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { AuthModule } from './auth/auth.module';
import { CursosModule } from './cursos/cursos.module';
import { EvaluacionesModule } from './evaluaciones/evaluaciones.module';
import { EstudiantesModule } from './estudiantes/estudiantes.module';
import { MatriculasModule } from './matriculas/matriculas.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { CertificadosModule } from './certificados/certificados.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HealthModule } from './health/health.module';
import { ListenersModule } from './common/listeners/listeners.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

/** Vida del token de sesión. Debe coincidir con `VIDA_TOKEN_MS` del servicio de revocación. */
const VIGENCIA_TOKEN = '24h';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // En producción las variables las inyecta el entorno (cPanel, Docker, systemd);
      // leer un fichero .env allí sería una fuente de configuración que nadie controla.
      envFilePath: process.env.NODE_ENV === 'production' ? [] : ['../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: VIGENCIA_TOKEN },
      }),
    }),

    // Límite general por IP. Los flujos sensibles (acceso, correo, subidas) lo estrechan
    // con su propio @Throttle, y el latido del visor de curso lo omite con @SkipThrottle.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),

    EventEmitterModule.forRoot(),

    // Infraestructura
    PrismaModule,
    RealtimeModule,
    StorageModule,
    ConfiguracionModule,
    MailModule,
    NotificacionesModule,

    // Dominio
    AuthModule,
    CursosModule,
    EvaluacionesModule,
    EstudiantesModule,
    MatriculasModule,
    DashboardsModule,
    CertificadosModule,

    // Procesos de fondo y diagnóstico
    ListenersModule,
    SchedulerModule,
    HealthModule,
  ],
  providers: [
    // Toda ruta exige sesión salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Y, cuando la ruta declara @Roles(), también el rol adecuado.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
