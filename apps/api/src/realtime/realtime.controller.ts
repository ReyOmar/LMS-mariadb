import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

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
    reply.hijack();
    const res = reply.raw;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` impide que un proxy intermedio recomprima o agrupe el flujo.
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // Desactiva el búfer de nginx; Apache lo respeta a través de mod_proxy.
      'X-Accel-Buffering': 'no',
    });
    // Intervalo de reconexión sugerido al cliente si el flujo se corta.
    res.write('retry: 3000\n\n');
    res.flushHeaders?.();

    const darDeBaja = this.realtime.registrar(user, res);
    req.raw.on('close', darDeBaja);
    req.raw.on('error', darDeBaja);
  }

  /**
   * Toma el aviso de "curso en edición" para que otro editor no lo abra en paralelo.
   * Sustituye al mensaje `course:lock` que antes viajaba por WebSocket.
   */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Post('cursos/:curso_guid/bloqueo')
  async tomarBloqueo(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    const curso = await this.prisma.lms_cursos.findFirst({
      where: { guid: cursoGuid, pais: user.pais },
      select: { guid: true },
    });
    if (!curso) throw new NotFoundException('Curso no encontrado.');

    const perfil = await this.prisma.usuarios.findUnique({
      where: { guid: user.sub },
      select: { nombre: true, apellido: true },
    });
    if (!perfil) throw new BadRequestException('Sesión no válida.');

    const editor = this.realtime.tomarEdicionDeCurso(
      cursoGuid,
      {
        guid: user.sub,
        nombre: `${perfil.nombre} ${perfil.apellido}`,
        rol: user.role === 'ADMINISTRADOR' ? 'Administrador' : 'Examinador',
        pais: user.pais,
      },
      user.pais,
    );

    return { editor, esMio: editor.guid === user.sub };
  }

  /** Libera el aviso de edición. Sólo surte efecto si lo tenía quien lo pide. */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Delete('cursos/:curso_guid/bloqueo')
  liberarBloqueo(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    this.realtime.liberarEdicionDeCurso(cursoGuid, user.pais, user.sub);
    return { liberado: true };
  }
}
