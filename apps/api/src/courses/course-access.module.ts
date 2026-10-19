import { Module } from '@nestjs/common';
import { CourseAccessService } from './course-access.service';

/**
 * Las comprobaciones de sede, propiedad y matrícula de un curso, en un módulo propio: las
 * comparten casi todos los demás, también el tiempo real, que no puede depender de los cursos.
 */
@Module({
  providers: [CourseAccessService],
  exports: [CourseAccessService],
})
export class CourseAccessModule {}
