import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { CoursesModule } from '../courses/courses.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [CoursesModule, CertificatesModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}
