import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { StorageModule } from '../storage/storage.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [StorageModule, ConfiguracionModule],
  controllers: [AuthController],
  providers: [AuthService, UserService, TokenBlacklistService],
  exports: [TokenBlacklistService, UserService],
})
export class AuthModule {}
