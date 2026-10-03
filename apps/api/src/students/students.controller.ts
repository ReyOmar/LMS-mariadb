import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StudentsService } from './students.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ActiveDaysDto, HeartbeatDto, MarkResourceDto } from './dto/students.dto';

/**
 * Todos los endpoints operan sobre el usuario en sesión. Ninguno acepta un identificador de
 * usuario: el progreso, las métricas y el tiempo de estudio son del titular del token.
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('/progress/:courseGuid')
  getProgress(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    return this.students.getProgress(courseGuid, user);
  }

  @Post('/complete-resource')
  markResourceCompleted(@CurrentUser() user: JwtPayload, @Body() dto: MarkResourceDto) {
    return this.students.markResourceCompleted(dto.resourceGuid, user);
  }

  @Get('/metrics')
  getMetrics(@CurrentUser() user: JwtPayload) {
    return this.students.getMetrics(user);
  }

  @Get('/active-days')
  getActiveDays(@CurrentUser() user: JwtPayload, @Query() dto: ActiveDaysDto) {
    return this.students.getActiveDays(user, dto.year, dto.month);
  }

  /**
   * Latido del visor de curso, una vez por minuto mientras la pestaña está visible.
   * Queda fuera del límite global de peticiones: es tráfico previsible y constante que,
   * contabilizado, agotaría la cuota del alumno durante una sesión de estudio larga.
   */
  @SkipThrottle()
  @Post('/heartbeat')
  recordHeartbeat(@CurrentUser() user: JwtPayload, @Body() dto: HeartbeatDto) {
    return this.students.recordHeartbeat(dto.courseGuid, user);
  }
}
