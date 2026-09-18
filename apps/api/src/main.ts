import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TAMANO_MAXIMO_BYTES } from './storage/storage.service';

/** Tamaño máximo de un cuerpo JSON. Los archivos van por multipart, no por aquí. */
const LIMITE_JSON_BYTES = 2 * 1024 * 1024;

/** Longitud mínima aceptable para el secreto de firma de los tokens. */
const LONGITUD_MINIMA_SECRETO = 32;

/** Valores de ejemplo que nunca deben llegar a producción. */
const SECRETOS_INSEGUROS = ['change_this_in_production', 'lms-super-secret-key-2026', 'secret', 'jwt_secret'];

/** Peticiones más lentas que esto se registran como aviso. */
const UMBRAL_LENTITUD_MS = 1000;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Arranque');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: LIMITE_JSON_BYTES }),
  );

  const config = app.get(ConfigService);
  validarSecreto(config, logger);

  await registrarPlugins(app);
  configurarTrazas(app);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta lo que no declare el DTO y rechaza la petición si trae campos de más:
      // un campo mal escrito da error en lugar de guardarse a medias sin avisar.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: origenesPermitidos(config),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // La documentación describe toda la superficie de la API: sólo fuera de producción.
  if (process.env.NODE_ENV !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('LMS PESV Education').setVersion('2.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, documento);
    logger.log('Documentación de la API en /docs');
  }

  app.enableShutdownHooks();

  const puerto = Number(process.env.PORT ?? process.env.APP_PORT ?? 3200);
  await app.listen(puerto, '0.0.0.0');
  logger.log(`API escuchando en el puerto ${puerto}`);
}

/**
 * El secreto de firma es lo único que separa un token legítimo de uno falsificado.
 * Si falta, es corto o es uno de los de ejemplo, el proceso no arranca: seguir con un
 * secreto adivinable equivale a no tener autenticación.
 */
function validarSecreto(config: ConfigService, logger: Logger): void {
  const secreto = config.get<string>('JWT_SECRET') ?? '';

  if (!secreto || secreto.length < LONGITUD_MINIMA_SECRETO || SECRETOS_INSEGUROS.includes(secreto)) {
    logger.error(
      `JWT_SECRET ausente, demasiado corto (mínimo ${LONGITUD_MINIMA_SECRETO} caracteres) o con un valor de ejemplo.`,
    );
    logger.error('Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
}

async function registrarPlugins(app: NestFastifyApplication): Promise<void> {
  await app.register(compress, {
    global: true,
    // El flujo de eventos en tiempo real no se comprime: la compresión bufferiza y los
    // mensajes no llegarían hasta acumular suficiente contenido.
    customTypes: /^(?!text\/event-stream)(text\/|application\/(json|javascript|xml))/,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Swagger UI necesita estilos en línea.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // El cliente vive en otro origen y necesita incrustar imágenes servidas por la API.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  });

  await app.register(multipart, {
    limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 },
  });
}

/**
 * Identificador de correlación por petición y registro de acceso.
 * El identificador vuelve en la cabecera `X-Request-ID` y en el cuerpo de los errores, de
 * modo que un usuario puede indicarlo al reportar un problema y se localiza la traza exacta.
 */
function configurarTrazas(app: NestFastifyApplication): void {
  const logger = new Logger('HTTP');
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', (peticion, respuesta, siguiente) => {
    const id = (peticion.headers['x-request-id'] as string) || randomUUID();
    (peticion as { id: string }).id = id;
    respuesta.header('X-Request-ID', id);
    siguiente();
  });

  fastify.addHook('onResponse', (peticion, respuesta, siguiente) => {
    // Ni la comprobación de salud ni el flujo de eventos aportan nada al registro: la
    // primera llega constantemente y el segundo dura horas abierto.
    const url = peticion.url;
    if (url === '/api/health' || url.startsWith('/api/realtime/stream')) {
      siguiente();
      return;
    }

    const ms = respuesta.elapsedTime ?? 0;
    const linea = `${peticion.method} ${url} ${respuesta.statusCode} ${ms.toFixed(0)}ms [${(peticion as { id?: string }).id}]`;

    if (respuesta.statusCode >= 500) logger.error(linea);
    else if (ms > UMBRAL_LENTITUD_MS) logger.warn(`LENTA ${linea}`);
    else logger.log(linea);

    siguiente();
  });
}

/**
 * Orígenes admitidos por CORS.
 * `CORS_ORIGIN` acepta varias URLs separadas por comas, porque las dos sedes pueden
 * servirse desde dominios distintos apuntando a la misma API.
 */
function origenesPermitidos(config: ConfigService): string[] {
  return (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3100')
    .split(',')
    .map((origen) => origen.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

void bootstrap();
