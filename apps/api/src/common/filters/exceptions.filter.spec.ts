import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExceptionsFilter } from './exceptions.filter';

/**
 * Traducción de fallos a respuestas.
 *
 * Lo que se comprueba aquí es lo que ve el usuario cuando algo sale mal: que el código HTTP
 * corresponda a lo ocurrido y que el texto esté en español y le sirva para reaccionar.
 */

interface CapturedResponse {
  status: number;
  body: {
    statusCode: number;
    error: string;
    message: string;
    timestamp: string;
    requestId?: string;
  };
}

/** Recoge lo que el filtro envía, imitando lo justo de Fastify. */
function capture(exception: unknown, request: Record<string, unknown> = {}): CapturedResponse {
  const caught = {} as CapturedResponse;

  const response = {
    status(code: number) {
      caught.status = code;
      return this;
    },
    send(body: CapturedResponse['body']) {
      caught.body = body;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/prueba', headers: {}, ...request }),
    }),
  };

  new ExceptionsFilter().catch(exception, host as never);
  return caught;
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('fallo', { code, clientVersion: '7.8.0', meta });
}

describe('ExceptionsFilter', () => {
  describe('excepciones de Nest', () => {
    it('conserva el código y el mensaje', () => {
      const { status, body } = capture(new NotFoundException('Curso no encontrado.'));

      expect(status).toBe(404);
      expect(body.message).toBe('Curso no encontrado.');
      expect(body.error).toBe('Not Found');
    });

    it('une en una frase los mensajes de validación', () => {
      const exception = new BadRequestException({
        message: ['El correo no es válido', 'La contraseña es obligatoria'],
        error: 'Bad Request',
      });

      expect(capture(exception).body.message).toBe('El correo no es válido. La contraseña es obligatoria');
    });

    it('traduce el «Cannot GET» del enrutador', () => {
      // Es el único texto en inglés que se cuela desde el marco de trabajo.
      const { body } = capture(new NotFoundException('Cannot GET /api/inventada'));

      expect(body.message).toBe('La dirección solicitada no existe en la API.');
    });

    it('no confunde un mensaje propio que empiece parecido', () => {
      const { body } = capture(new ForbiddenException('Cannot es un curso de inglés.'));

      expect(body.message).toBe('Cannot es un curso de inglés.');
    });
  });

  describe('errores de base de datos', () => {
    it('un duplicado es un conflicto, no un error del servidor', () => {
      const { status, body } = capture(prismaError('P2002', { target: ['email'] }));

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.message).toBe('Ya existe un registro con ese email.');
    });

    it('nombra los campos del índice compuesto', () => {
      const { body } = capture(prismaError('P2002', { target: ['usuario_guid', 'curso_guid'] }));

      expect(body.message).toBe('Ya existe un registro con ese usuario y curso.');
    });

    it('funciona aunque el error no diga qué campo se duplicó', () => {
      const { status, body } = capture(prismaError('P2002'));

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.message).toBe('Ya existe un registro con ese valor.');
    });

    it('modificar algo que ya no existe es un 404', () => {
      expect(capture(prismaError('P2025')).status).toBe(HttpStatus.NOT_FOUND);
    });

    it('una clave ajena rota es un 400 que invita a revisar lo relacionado', () => {
      const { status, body } = capture(prismaError('P2003'));

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body.message).toMatch(/relacionados/);
    });

    it('un código desconocido no filtra detalles internos', () => {
      const { status, body } = capture(prismaError('P2037'));

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('Ha ocurrido un error interno. Inténtalo de nuevo más tarde.');
    });
  });

  describe('base de datos inalcanzable', () => {
    it('responde 503 y sugiere reintentar', () => {
      // El adaptador de MariaDB envuelve el fallo de red en su propio error.
      const failure = Object.assign(new Error('pool timeout: failed to retrieve a connection'), {
        name: 'DriverAdapterError',
      });

      const { status, body } = capture(failure);

      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.message).toMatch(/no está disponible/);
    });

    it('reconoce el fallo de red aunque venga anidado', () => {
      const failure = Object.assign(new Error('consulta fallida'), {
        cause: { cause: 'connect ECONNREFUSED 127.0.0.1:3306' },
      });

      expect(capture(failure).status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });

  // Fastify y sus complementos lanzan errores propios con el código HTTP ya puesto. No son
  // excepciones de Nest, pero un archivo demasiado grande no es un «error interno».
  describe('errores del propio servidor web', () => {
    function fromFastify(message: string, statusCode: number) {
      return Object.assign(new Error(message), { name: 'FastifyError', statusCode });
    }

    it('un archivo demasiado grande es un 413 que lo dice, no un error interno', () => {
      const { status, body } = capture(fromFastify('request file too large', 413));

      expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(body.message).toBe('El archivo supera el tamaño máximo permitido.');
    });

    it('un cuerpo demasiado grande también se explica en español', () => {
      const { status, body } = capture(new HttpException('Request body is too large', 413));

      expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(body.message).toBe('Los datos enviados superan el tamaño máximo permitido.');
    });

    it('un mensaje en inglés que no se conoce no llega a la pantalla', () => {
      const { status, body } = capture(fromFastify('Unsupported Media Type: text/plain', 415));

      expect(status).toBe(415);
      expect(body.message).not.toMatch(/Unsupported/);
    });

    it('un código 5xx propio sigue siendo un error interno sin detalles', () => {
      const { status, body } = capture(fromFastify('something broke inside', 503));

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).not.toMatch(/broke/);
    });
  });

  describe('forma de la respuesta', () => {
    it('siempre lleva código, etiqueta, mensaje y fecha', () => {
      const { body } = capture(new HttpException('Algo', 418));

      expect(body).toMatchObject({ statusCode: 418, message: 'Algo' });
      expect(typeof body.error).toBe('string');
      expect(Date.parse(body.timestamp)).not.toBeNaN();
    });

    it('incluye el identificador de la petición para poder rastrearla', () => {
      const { body } = capture(new NotFoundException('x'), { id: 'abc-123' });

      expect(body.requestId).toBe('abc-123');
    });

    it('lo omite si la petición no lo trae', () => {
      expect(capture(new NotFoundException('x')).body.requestId).toBeUndefined();
    });

    it('un error inesperado no revela su mensaje original', () => {
      const { status, body } = capture(new Error('fallo en la línea 42 de secretos.ts'));

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).not.toMatch(/secretos/);
    });

    it('tampoco se rompe con algo que no sea un Error', () => {
      const { status } = capture('esto no es un error');

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
