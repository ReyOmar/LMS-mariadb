import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EstudiantesService } from './estudiantes.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { DiasActivosDto, LatidoDto, MarcarRecursoDto } from './dto/estudiantes.dto';

/**
 * Todos los endpoints operan sobre el usuario en sesión.
 * Ninguno acepta un `usuario_guid`: el progreso, las métricas y el tiempo de estudio son
 * del titular del token y de nadie más.
 */
@Controller('estudiantes')
export class EstudiantesController {
  constructor(private readonly estudiantes: EstudiantesService) {}

  @Get('/progreso/:curso_guid')
  getProgreso(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.estudiantes.getProgreso(cursoGuid, user);
  }

  @Post('/completar-recurso')
  marcarRecursoCompletado(@CurrentUser() user: JwtPayload, @Body() dto: MarcarRecursoDto) {
    return this.estudiantes.marcarRecursoCompletado(dto.recurso_guid, user);
  }

  @Get('/metricas')
  getMetricas(@CurrentUser() user: JwtPayload) {
    return this.estudiantes.getMetricas(user);
  }

  @Get('/dias-activos')
  getDiasActivos(@CurrentUser() user: JwtPayload, @Query() dto: DiasActivosDto) {
    return this.estudiantes.getDiasActivos(user, dto.year, dto.month);
  }

  @Get('/notas/:curso_guid')
  getNotas(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.estudiantes.getNotasDeCurso(cursoGuid, user);
  }

  /**
   * Latido del visor de curso, una vez por minuto mientras la pestaña está visible.
   * Queda fuera del límite global de peticiones: es tráfico previsible y constante que,
   * contabilizado, agotaría la cuota del alumno durante una sesión de estudio larga.
   */
  @SkipThrottle()
  @Post('/latido')
  registrarLatido(@CurrentUser() user: JwtPayload, @Body() dto: LatidoDto) {
    return this.estudiantes.registrarLatido(dto.curso_guid, user);
  }
}
