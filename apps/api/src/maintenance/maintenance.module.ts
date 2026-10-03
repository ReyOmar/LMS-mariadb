import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
