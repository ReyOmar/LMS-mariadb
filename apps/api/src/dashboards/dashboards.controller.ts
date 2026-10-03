import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { MonitoringService } from './monitoring.service';
import { MonitoringFilterDto } from './dto/monitoring-filter.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly dashboards: DashboardsService,
    private readonly monitoring: MonitoringService,
  ) {}

  @Roles('ADMIN')
  @Get('/admin')
  getCountrySummary(@CurrentUser() user: JwtPayload) {
    return this.dashboards.getCountrySummary(user.country);
  }

  /** Alumnos de los cursos que gestiona quien consulta, por páginas. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/monitoring')
  getStudents(@CurrentUser() user: JwtPayload, @Query() filter: MonitoringFilterDto) {
    return this.monitoring.getStudents(user, filter);
  }

  /** Cifras y gráficas de todos los alumnos que casan con el filtro, no sólo de una página. */
  @Roles('ADMIN', 'TEACHER')
  @Get('/monitoring/summary')
  getMonitoringSummary(@CurrentUser() user: JwtPayload, @Query() filter: MonitoringFilterDto) {
    return this.monitoring.getSummary(user, filter);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('/monitoring/:courseGuid/:studentGuid')
  getStudentModules(
    @CurrentUser() user: JwtPayload,
    @Param('courseGuid') courseGuid: string,
    @Param('studentGuid') studentGuid: string,
  ) {
    return this.monitoring.getStudentModules(courseGuid, studentGuid, user);
  }
}
