import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessRequestsService } from './access-requests.service';
import { UserService } from './user.service';
import { ProfileService } from './profile.service';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [StorageModule, SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, AccessRequestsService, ProfileService, UserService],
  exports: [UserService],
})
export class AuthModule {}
