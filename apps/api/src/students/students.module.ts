import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { CoursesModule } from '../courses/courses.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CoursesModule, SettingsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
