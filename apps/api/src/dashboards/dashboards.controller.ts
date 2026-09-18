import { Controller, Get, Param } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Roles('ADMINISTRADOR')
  @Get('/administracion')
  getResumenSede(@CurrentUser() user: JwtPayload) {
    return this.dashboards.getResumenSede(user.pais);
  }

  /** Alumnos de los cursos que gestiona quien consulta. Sin parámetros: sale del token. */
  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/monitoreo')
  getMonitoreo(@CurrentUser() user: JwtPayload) {
    return this.dashboards.getMonitoreo(user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/monitoreo/:curso_guid/:alumno_guid')
  getDetalleDeAlumno(
    @CurrentUser() user: JwtPayload,
    @Param('curso_guid') cursoGuid: string,
    @Param('alumno_guid') alumnoGuid: string,
  ) {
    return this.dashboards.getDetalleDeAlumno(cursoGuid, alumnoGuid, user);
  }
}
