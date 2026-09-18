import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { EvaluacionesService } from './evaluaciones.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { leerArchivoDeLaPeticion } from '../storage/multipart';
import { CalificarEntregaDto } from './dto/calificar-entrega.dto';

@Controller('evaluaciones')
export class EvaluacionesController {
  constructor(private readonly evaluaciones: EvaluacionesService) {}

  // ── Alumno ───────────────────────────────────────────────────────────────

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('/tareas/:tarea_guid/entregas')
  async submitEntrega(
    @CurrentUser() user: JwtPayload,
    @Param('tarea_guid') tareaGuid: string,
    @Req() req: FastifyRequest,
  ) {
    const archivo = await leerArchivoDeLaPeticion(req);
    return this.evaluaciones.registrarEntrega(tareaGuid, archivo, user);
  }

  @Get('/tareas/:tarea_guid/entregas/mia')
  getMiEntrega(@CurrentUser() user: JwtPayload, @Param('tarea_guid') tareaGuid: string) {
    return this.evaluaciones.getMiEntrega(tareaGuid, user);
  }

  // ── Examinador ───────────────────────────────────────────────────────────

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/examinador/entregas')
  getEntregasParaCalificar(@CurrentUser() user: JwtPayload) {
    return this.evaluaciones.getEntregasParaCalificar(user);
  }

  /** Resultados de los cuestionarios, que se corrigen automáticamente. */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/examinador/cuestionarios')
  getIntentosDeCuestionario(@CurrentUser() user: JwtPayload) {
    return this.evaluaciones.getIntentosDeCuestionario(user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/tareas/:tarea_guid/entregas')
  getEntregasDeTarea(@CurrentUser() user: JwtPayload, @Param('tarea_guid') tareaGuid: string) {
    return this.evaluaciones.getEntregasDeTarea(tareaGuid, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Patch('/entregas/:guid/calificar')
  calificarEntrega(
    @CurrentUser() user: JwtPayload,
    @Param('guid') guid: string,
    @Body() dto: CalificarEntregaDto,
  ) {
    return this.evaluaciones.calificarEntrega(guid, dto, user);
  }

  /** Concede un intento adicional a un alumno que agotó los del cuestionario. */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Post('/quiz/:recurso_guid/alumnos/:alumno_guid/nuevo-intento')
  habilitarNuevoIntento(
    @CurrentUser() user: JwtPayload,
    @Param('recurso_guid') recursoGuid: string,
    @Param('alumno_guid') alumnoGuid: string,
  ) {
    return this.evaluaciones.habilitarNuevoIntento(recursoGuid, alumnoGuid, user);
  }
}
