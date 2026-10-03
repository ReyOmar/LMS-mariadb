import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';

/** Global: los avisos por correo se disparan desde casi todos los módulos de dominio. */
@Global()
@Module({
  imports: [SettingsModule, StorageModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
