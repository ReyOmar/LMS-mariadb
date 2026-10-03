import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { StudentsModule } from './students/students.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { CertificatesModule } from './certificates/certificates.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { HealthModule } from './health/health.module';
import { ListenersModule } from './common/listeners/listeners.module';

import { JwtGuard } from './common/guards/jwt.guard';
import { RolesGuard } from './common/guards/roles.guard';

const TOKEN_VALIDITY = '24h';

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
        signOptions: { expiresIn: TOKEN_VALIDITY },
      }),
    }),

    // Límite general por IP. Los flujos sensibles (acceso, correo, subidas) lo estrechan
    // con su propio @Throttle, y el latido del visor de curso lo omite con @SkipThrottle.
    //
    // Que sea por IP y no del sitio entero depende de `trustProxy` (ver `main.ts`): tras
    // el proxy de cPanel, sin eso todas las peticiones parecerían venir de la misma.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      errorMessage: 'Has hecho demasiadas peticiones seguidas. Espera un minuto e inténtalo de nuevo.',
    }),

    EventEmitterModule.forRoot(),

    // Infraestructura
    PrismaModule,
    RealtimeModule,
    StorageModule,
    SettingsModule,
    MailModule,
    NotificationsModule,

    // Dominio
    AuthModule,
    CoursesModule,
    AssessmentsModule,
    StudentsModule,
    EnrollmentsModule,
    DashboardsModule,
    CertificatesModule,

    // Procesos de fondo y diagnóstico
    ListenersModule,
    MaintenanceModule,
    HealthModule,
  ],
  providers: [
    // Toda ruta exige sesión salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtGuard },
    // Y, cuando la ruta declara @Roles(), también el rol adecuado.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
