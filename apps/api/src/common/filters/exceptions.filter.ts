import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Mensajes que el marco de trabajo escribe en inglés y que llegan tal cual a la pantalla.
 * Se traducen por su texto porque es lo único estable que traen.
 */
const TRANSLATIONS: [RegExp, string][] = [
  [/^Cannot [A-Z]+ /, 'La dirección solicitada no existe en la API.'],
  // `ParseIntPipe` con un identificador que no es un número.
  [/^Validation failed \(numeric string is expected\)/, 'El identificador de la dirección debe ser un número.'],
  [/request file too large/i, 'El archivo supera el tamaño máximo permitido.'],
  [/body is too large/i, 'Los datos enviados superan el tamaño máximo permitido.'],
  [/multipart/i, 'La petición debe enviarse como multipart/form-data.'],
  // `@fastify/multipart` al recibir más archivos o campos de los que admite la subida.
  [/reach (files|parts|fields) limit/i, 'Envía un solo archivo por subida.'],
];

/** Une varias frases en una, poniendo el punto que falte entre ellas. */
function joinSentences(sentences: string[]): string {
  return sentences
    .map((sentence, i) => (i < sentences.length - 1 && !/[.!?]$/.test(sentence) ? `${sentence}.` : sentence))
    .join(' ');
}

/**
 * Traducción de cualquier fallo a una respuesta JSON uniforme.
 *
 * Sin este filtro, Nest devuelve el error tal cual: a veces HTML, a veces con la traza
 * dentro. Aquí todo sale con la misma forma, en español y sin detalles internos, mientras
 * el registro del servidor conserva la traza completa.
 *
 * Los errores de Prisma merecen atención aparte. Un correo repetido o una clave ajena que
 * no existe son situaciones previsibles —cosas que el usuario puede corregir—, así que se
 * traducen a códigos 4xx con un texto que dice qué pasó, en lugar de un «error interno».
 *
 * Forma de la respuesta:
 * `{ statusCode, error, message, timestamp, requestId? }`
 */
@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest | undefined>();

    const { status, error, message, shouldLog } = this.interpret(exception, request);
    const requestId = request?.id;

    if (shouldLog) {
      this.logger.error(
        `[${status}] ${request?.method} ${request?.url} — ${message}${requestId ? ` [${requestId}]` : ''}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Rechazada una subida por su tamaño, el resto del cuerpo sobra: cerrar la conexión hace
    // que el navegador deje de enviarlo en lugar de subirlo entero para nada.
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) response.header('Connection', 'close');

    response.status(status).send({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    });
  }

  private interpret(exception: unknown, request: { method?: string; url?: string } | undefined) {
    if (exception instanceof HttpException) {
      return { ...this.fromHttpException(exception), shouldLog: exception.getStatus() >= 500 };
    }

    // Fastify y sus complementos lanzan sus propios errores con el código HTTP ya puesto
    // —un archivo demasiado grande trae un 413—. No son excepciones de Nest, pero son
    // fallos de la petición, no del servidor.
    const own = this.withOwnStatus(exception);
    if (own) return { ...own, shouldLog: false };

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const translated = this.fromDatabaseError(exception);
      // Los conflictos previsibles no son fallos del servidor, pero conviene verlos en el
      // registro: si se repiten, falta una comprobación antes de la escritura.
      this.logger.warn(`Prisma ${exception.code} en ${request?.method} ${request?.url}: ${translated.message}`);
      return { ...translated, shouldLog: false };
    }

    if (this.isConnectionFailure(exception)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'La base de datos no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
        shouldLog: true,
      };
    }

    // Cualquier otra cosa —una consulta mal construida incluida— es un fallo de
    // programación: se registra entero y al cliente no se le da ningún detalle.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Ha ocurrido un error interno. Inténtalo de nuevo más tarde.',
      shouldLog: true,
    };
  }

  private fromHttpException(exception: HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { status, error: this.statusName(status), message: this.toSpanish(body) };
    }

    const data = body as { message?: string | string[]; error?: string };
    // La validación devuelve un mensaje por campo.
    const message = Array.isArray(data.message)
      ? joinSentences(data.message)
      : (data.message ?? this.statusName(status));

    return { status, error: data.error ?? this.statusName(status), message: this.toSpanish(message) };
  }

  /** Errores con un estado HTTP 4xx propio, como los de Fastify. */
  private withOwnStatus(exception: unknown) {
    const error = exception as { statusCode?: unknown; message?: string };
    const status = error?.statusCode;
    if (typeof status !== 'number' || status < 400 || status >= 500) return null;

    // Su texto viene en inglés: si no es uno de los conocidos no se enseña, se describe.
    const known = TRANSLATIONS.find(([pattern]) => pattern.test(error.message ?? ''));
    const generic =
      status === HttpStatus.PAYLOAD_TOO_LARGE
        ? 'Los datos enviados superan el tamaño máximo permitido.'
        : 'La petición no es válida. Revisa lo que has enviado e inténtalo de nuevo.';

    return { status, error: this.statusName(status), message: known ? known[1] : generic };
  }

  /** El marco de trabajo responde en inglés; el resto del campus habla español. */
  private toSpanish(message: string): string {
    const translation = TRANSLATIONS.find(([pattern]) => pattern.test(message));
    return translation ? translation[1] : message;
  }

  /**
   * Distingue «la base de datos no responde» de un fallo de programación.
   *
   * El adaptador de MariaDB no lanza los errores tipados de Prisma cuando ni siquiera
   * consigue una conexión: llega un `DriverAdapterError` con el fallo de red dentro. Se
   * responde 503, que sugiere reintentar, en lugar de un «error interno».
   */
  private isConnectionFailure(exception: unknown): boolean {
    if (exception instanceof Prisma.PrismaClientInitializationError) return true;

    const error = exception as { name?: string; message?: string; cause?: { cause?: unknown } };
    if (error?.name === 'DriverAdapterError') return true;

    const text = `${error?.message ?? ''} ${String(error?.cause?.cause ?? '')}`;
    return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|pool timeout|Can't reach database|Connection lost/i.test(
      text,
    );
  }

  /**
   * Códigos de Prisma que un usuario puede provocar con datos normales.
   * El resto queda como error interno: revelar el detalle de un fallo de esquema no ayuda
   * a quien lo sufre y sí a quien lo busca.
   */
  private fromDatabaseError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `Ya existe un registro con ese ${this.conflictingField(exception)}.`,
        };

      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'El registro que intentas modificar ya no existe.',
        };

      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'La operación afecta a otros registros relacionados. Revísalos antes de continuar.',
        };

      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'No se puede completar: dejaría datos relacionados sin referencia.',
        };

      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Alguno de los valores enviados es demasiado largo para el campo.',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Ha ocurrido un error interno. Inténtalo de nuevo más tarde.',
        };
    }
  }

  /** Nombre del campo duplicado, para que el mensaje diga qué corregir. */
  private conflictingField(exception: Prisma.PrismaClientKnownRequestError): string {
    const target = (exception.meta as { target?: string[] | string } | undefined)?.target;
    const fields = Array.isArray(target) ? target : target ? [target] : [];

    const readableNames = fields
      .map((field) => field.replace(/_guid$/, '').replace(/_/g, ' '))
      .filter((field) => field && field !== 'id');

    return readableNames.length > 0 ? readableNames.join(' y ') : 'valor';
  }

  /** `404` → `Not Found`. Sólo se usa cuando la excepción no trae su propia etiqueta. */
  private statusName(status: number): string {
    const name = HttpStatus[status];
    if (!name) return 'Error';

    return String(name)
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
