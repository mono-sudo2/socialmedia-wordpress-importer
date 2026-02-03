import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LogtoService } from './logto.service';
import { AuthGuard } from './auth.guard';
import { RequiresOrganizationGuard } from './requires-organization.guard';

@Module({
  imports: [ConfigModule],
  providers: [LogtoService, AuthGuard, RequiresOrganizationGuard],
  exports: [LogtoService, AuthGuard, RequiresOrganizationGuard],
})
export class AuthModule {}
