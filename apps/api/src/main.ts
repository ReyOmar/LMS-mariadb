import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { ExceptionsFilter } from './common/filters/exceptions.filter';
import { createValidationPipe } from './common/validation/validation.pipe';
import { allowedOrigins } from './common/cors';
import { MIB, readUploadCeiling } from './storage/upload-limits';

/** Tamaño máximo de un cuerpo JSON. Los archivos van por multipart, no por aquí. */
const JSON_LIMIT_BYTES = 2 * 1024 * 1024;

/** Longitud mínima aceptable para el secreto de firma de los tokens. */
const MIN_SECRET_LENGTH = 32;

/** Valores de ejemplo que nunca deben llegar a producción. */
const INSECURE_SECRETS = ['change_this_in_production', 'lms-super-secret-key-2026', 'secret', 'jwt_secret'];

/** Peticiones más lentas que esto se registran como aviso. */
const SLOW_REQUEST_THRESHOLD_MS = 1000;

/** Identificador de correlación que se acepta del cliente; cualquier otro se sustituye. */
const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

/**
 * De quién se acepta la cabecera que dice cuál es la IP real del visitante.
 *
 * En cPanel la API vive detrás de Apache, así que todas las peticiones le llegan desde el
 * propio servidor. Sin esto, el límite de peticiones dejaría de ser por visitante para
 * pasar a ser del sitio entero: con unas pocas personas trabajando a la vez, la
 * plataforma empezaría a rechazar a todo el mundo por igual.
 *
 * Se confía sólo en el bucle local, que es por donde entra Apache, y no se puede engañar:
 * la cabecera se lee de derecha a izquierda hasta el primer remitente que no sea de
 * confianza. Quien la falsifique sólo consigue ensuciar el principio de la lista, porque
 * Apache añade detrás su dirección real, que es la que acaba contando. Y quien llegue a
 * la API sin pasar por el proxy no es de confianza, así que su cabecera se ignora entera.
 *
 * `TRUST_PROXY` permite declarar otras direcciones o rangos si algún día hay otro proxy
 * delante. Ampliarlo de más sí abre la puerta a falsificarla: sólo direcciones propias.
 */
const TRUSTED_PROXIES = process.env.TRUST_PROXY?.trim() || 'loopback';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Arranque');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: JSON_LIMIT_BYTES, trustProxy: TRUSTED_PROXIES }),
  );

  const config = app.get(ConfigService);
  validateSecret(config, logger);

  await registerPlugins(app, logger);
  configureRequestLogging(app);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ExceptionsFilter());
  app.useGlobalPipes(createValidationPipe());

  app.enableCors({
    origin: allowedOrigins(config),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    // Con la API en otro dominio, el navegador oculta esta cabecera si no se declara: es la
    // que dice cuánto debe esperar un formulario tras exceder el límite de intentos.
    exposedHeaders: ['Retry-After'],
  });

  // La documentación describe toda la superficie de la API: sólo en desarrollo.
  //
  // La condición se comprueba en positivo a propósito. Con un «distinto de producción»,
  // un servidor donde alguien olvide declarar NODE_ENV publicaría el mapa completo de la
  // API a cualquiera que pase por /docs. Así, lo que falla es lo inofensivo: si la
  // variable no está, no hay documentación.
  if (process.env.NODE_ENV === 'development') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('LMS PESV Education').setVersion('2.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, document);
    logger.log('Documentación de la API en /docs');
  }

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? process.env.APP_PORT ?? 3200);
  await app.listen(port, '0.0.0.0');
  logger.log(`API escuchando en el puerto ${port}`);
}

/**
 * El secreto de firma es lo único que separa un token legítimo de uno falsificado.
 * Si falta, es corto o es uno de los de ejemplo, el proceso no arranca: seguir con un
 * secreto adivinable equivale a no tener autenticación.
 */
function validateSecret(config: ConfigService, logger: Logger): void {
  const secret = config.get<string>('JWT_SECRET') ?? '';

  if (!secret || secret.length < MIN_SECRET_LENGTH || INSECURE_SECRETS.includes(secret)) {
    logger.error(
      `JWT_SECRET ausente, demasiado corto (mínimo ${MIN_SECRET_LENGTH} caracteres) o con un valor de ejemplo.`,
    );
    logger.error("Genera uno con: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
    process.exit(1);
  }
}

async function registerPlugins(app: NestFastifyApplication, logger: Logger): Promise<void> {
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

  // Tope técnico de cualquier subida. Cada ruta aplica además el límite exacto de lo que
  // recibe —el de la tarea, el de la sede o el de las imágenes— al llamar a `receiveFile`.
  const ceiling = readUploadCeiling(process.env.MAX_UPLOAD_MB);
  if (ceiling.warning) logger.warn(ceiling.warning);
  logger.log(`Tope de subida de archivos: ${ceiling.mb} MB`);

  await app.register(multipart, {
    limits: { fileSize: ceiling.mb * MIB, files: 1 },
  });

  // El plugin escribe cada subida en un fichero temporal y lo borra al responder. Si el
  // navegador corta la subida a la mitad no hay respuesta que enviar, así que ese borrado
  // nunca llega a ejecutarse y el temporal se queda en el disco para siempre. Éste es el
  // único aviso que da Fastify cuando el cliente se desconecta antes de tiempo.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequestAbort', async (request) => {
      await request.cleanRequestFiles();
    });
}

/**
 * Identificador de correlación por petición y registro de acceso.
 * El identificador vuelve en la cabecera `X-Request-ID` y en el cuerpo de los errores, de
 * modo que un usuario puede indicarlo al reportar un problema y se localiza la traza exacta.
 * El que envíe el cliente sólo se respeta si tiene forma de identificador: acaba en el
 * registro y en una cabecera de respuesta.
 */
function configureRequestLogging(app: NestFastifyApplication): void {
  const logger = new Logger('HTTP');
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', (request, response, next) => {
    const received = request.headers['x-request-id'];
    request.id = typeof received === 'string' && REQUEST_ID_PATTERN.test(received) ? received : randomUUID();
    response.header('X-Request-ID', request.id);
    next();
  });

  fastify.addHook('onResponse', (request, response, next) => {
    // Ni la comprobación de salud ni el flujo de eventos aportan nada al registro: la
    // primera llega constantemente y el segundo dura horas abierto.
    const url = request.url;
    if (url === '/api/health' || url.startsWith('/api/realtime/stream')) {
      next();
      return;
    }

    const ms = response.elapsedTime ?? 0;
    const line = `${request.method} ${url} ${response.statusCode} ${ms.toFixed(0)}ms [${request.id}]`;

    if (response.statusCode >= 500) logger.error(line);
    else if (ms > SLOW_REQUEST_THRESHOLD_MS) logger.warn(`LENTA ${line}`);
    else logger.log(line);

    next();
  });
}

bootstrap().catch((error) => {
  // Sin esto, un fallo de arranque —un puerto ocupado, un plugin que no carga— sale como
  // rechazo de promesa sin atender: traza larga y ninguna pista de qué hacer.
  new Logger('Arranque').error('La API no pudo arrancar.', error instanceof Error ? error.stack : error);
  process.exit(1);
});
