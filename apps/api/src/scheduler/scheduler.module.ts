import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { StorageModule } from '../storage/storage.module';
import { CertificadosModule } from '../certificados/certificados.module';
import { EstudiantesModule } from '../estudiantes/estudiantes.module';

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule, CertificadosModule, EstudiantesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
