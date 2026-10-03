import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateDataService } from './certificate-data.service';
import { CoursesModule } from '../courses/courses.module';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CoursesModule, StorageModule, SettingsModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificateDataService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
