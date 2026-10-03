import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { MonitoringService } from './monitoring.service';
import { CoursesModule } from '../courses/courses.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CoursesModule, SettingsModule],
  controllers: [DashboardsController],
  providers: [DashboardsService, MonitoringService],
})
export class DashboardsModule {}
