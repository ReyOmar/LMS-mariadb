import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import { randomUUID } from 'crypto';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 10485760 }) // 10MB for JSON bodies only
  );

  // Enable gzip/brotli compression for all responses
  await app.register(compress, { global: true });

  // Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],  // Swagger UI needs inline styles
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding resources (images, fonts)
    crossOriginResourcePolicy: false,  // Allow cross-origin <img>/<video> from frontend (different port/domain)
  });

  // Enable multipart/form-data for file uploads (50MB limit)
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 1, // Max 1 file per request
    },
  });

  // ── Request ID + Logging ──
  const httpLogger = new Logger('HTTP');
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request: any, reply: any, done: () => void) => {
    request.id = request.headers['x-request-id'] || randomUUID();
    reply.header('X-Request-ID', request.id);
    done();
  });
  fastify.addHook('onResponse', (request: any, reply: any, done: () => void) => {
    // Skip health checks from logs
    if (request.url !== '/api/health') {
      const ms = reply.elapsedTime?.toFixed(0) || '?';
      const status = reply.statusCode;
      const logLine = `${request.method} ${request.url} ${status} ${ms}ms [${request.id}]`;

      if (status >= 500) {
        httpLogger.error(logLine);
      } else if (Number(ms) > 1000) {
        httpLogger.warn(`SLOW ${logLine}`);
      } else {
        httpLogger.log(logLine);
      }
    }
    done();
  });
  
  const configService = app.get(ConfigService);

  // ── Security: Validate JWT_SECRET at startup ──
  const logger = new Logger('Bootstrap');
  const jwtSecret = configService.get<string>('JWT_SECRET') || '';
  const INSECURE_DEFAULTS = ['change_this_in_production', 'lms-super-secret-key-2026', 'secret', 'jwt_secret'];
  if (!jwtSecret || jwtSecret.length < 16 || INSECURE_DEFAULTS.includes(jwtSecret)) {
    logger.error('FATAL: JWT_SECRET is missing, too short (<16 chars), or using an insecure default.');
    logger.error('Generate a secure one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
  
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || 'http://localhost:3100',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger API docs — only in development (never expose API schema in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Enterprise LMS API')
      .setDescription('LMS Backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Enable WebSocket support with native ws adapter (compatible with Fastify)
  app.useWebSocketAdapter(new WsAdapter(app));

  // Enable graceful shutdown hooks (Prisma disconnect, cron cleanup, WS close)
  app.enableShutdownHooks();

  const port = process.env.PORT || process.env.APP_PORT || 3200;
  await app.listen(port, '0.0.0.0');
  logger.log(`LMS API running on port ${port}`);
}
bootstrap();
