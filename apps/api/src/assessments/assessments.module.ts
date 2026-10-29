import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { SubmissionsService } from './submissions.service';
import { ExaminerPanelsService } from './examiner-panels.service';
import { GradingService } from './grading.service';
import { CoursesModule } from '../courses/courses.module';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CoursesModule, StorageModule, SettingsModule],
  controllers: [AssessmentsController],
  providers: [SubmissionsService, ExaminerPanelsService, GradingService],
})
export class AssessmentsModule {}
