import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LogtoService } from './logto.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [LogtoService, AuthGuard],
  exports: [LogtoService, AuthGuard],
})
export class AuthModule {}
