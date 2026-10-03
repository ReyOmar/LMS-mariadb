import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { CoursesModule } from '../courses/courses.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [CoursesModule, StorageModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}
