import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { allowedOrigin } from '../common/cors';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Origen de la petición, si es uno de los admitidos. */
  private getAllowedOrigin(req: FastifyRequest): string | null {
    return allowedOrigin(this.config, req.headers.origin);
  }

  /**
   * Flujo de eventos en tiempo real (Server-Sent Events).
   *
   * El navegador lo consume con `fetch` y lectura por streaming, no con `EventSource`,
   * para poder mandar el token en la cabecera `Authorization` en lugar de en la URL.
   *
   * Se usa `reply.hijack()` para tomar el socket directamente: así la compresión global
   * de Fastify no intenta bufferizar un flujo que nunca termina.
   */
  @SkipThrottle()
  @Get('stream')
  stream(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest, @Res() reply: FastifyReply): void {
    // La cabecera de CORS se escribe aquí, **antes** de tomar el socket: `hijack()` deja
    // fuera a Fastify y la que añade el marco nunca llegaría a escribirse. Con la API y el
    // cliente en dominios distintos, como en cPanel, el navegador rechazaría el flujo.
    const origin = this.getAllowedOrigin(req);

    reply.hijack();
    const res = reply.raw;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` impide que un proxy intermedio recomprima o agrupe el flujo.
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // Desactiva el búfer de nginx; Apache lo respeta a través de mod_proxy.
      'X-Accel-Buffering': 'no',
      ...(origin && {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        // El origen decide la respuesta, así que las cachés deben separarlas.
        Vary: 'Origin',
      }),
    });
    // Intervalo de reconexión sugerido al cliente si el flujo se corta.
    res.write('retry: 3000\n\n');
    res.flushHeaders?.();

    const unsubscribe = this.realtime.register(user, res);
    req.raw.on('close', unsubscribe);
    req.raw.on('error', unsubscribe);
  }

  /**
   * Toma el aviso de "curso en edición" para que otro editor no lo abra en paralelo. Sólo
   * sobre un curso que quien lo pide puede editar: de su sede y, si es profesor, suyo.
   */
  @Roles('ADMIN', 'TEACHER')
  @Post('courses/:courseGuid/lock')
  async acquireLock(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        guid: courseGuid,
        country: user.country,
        ...(user.role === 'TEACHER' ? { teacherGuid: user.sub } : {}),
      },
      select: { guid: true },
    });
    if (!course) throw new NotFoundException('Curso no encontrado.');

    const profile = await this.prisma.user.findUnique({
      where: { guid: user.sub },
      select: { firstName: true, lastName: true },
    });
    if (!profile) throw new BadRequestException('Sesión no válida.');

    const editor = this.realtime.acquireCourseEdit(courseGuid, {
      guid: user.sub,
      name: `${profile.firstName} ${profile.lastName}`,
      role: user.role,
      country: user.country,
    });

    return { editor, isMine: editor.guid === user.sub };
  }

  /** Libera el aviso de edición. Sólo surte efecto si lo tenía quien lo pide. */
  @Roles('ADMIN', 'TEACHER')
  @Delete('courses/:courseGuid/lock')
  releaseLock(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    this.realtime.releaseCourseLock(courseGuid, user.sub);
    return { released: true };
  }
}
