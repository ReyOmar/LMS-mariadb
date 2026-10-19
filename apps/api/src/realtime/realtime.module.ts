import { Global, Module } from '@nestjs/common';
import { CourseAccessModule } from '../courses/course-access.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

/** Tiempo real del LMS. Es global porque casi todos los módulos de dominio notifican cambios. */
@Global()
@Module({
  imports: [CourseAccessModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
