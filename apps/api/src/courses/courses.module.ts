import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CourseContentService } from './course-content.service';
import { QuizService } from './quiz.service';
import { CourseAccessModule } from './course-access.module';
import { ContentRemovalService } from './content-removal.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule, CourseAccessModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseContentService, ContentRemovalService, QuizService],
  exports: [CourseAccessModule],
})
export class CoursesModule {}
