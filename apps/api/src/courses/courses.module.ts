import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CourseContentService } from './course-content.service';
import { QuizService } from './quiz.service';
import { CourseAccessService } from './course-access.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseContentService, QuizService, CourseAccessService],
  // Evaluaciones, estudiantes, certificados y paneles comparten las mismas comprobaciones
  // de sede, propiedad y matrícula.
  exports: [CourseAccessService],
})
export class CoursesModule {}
