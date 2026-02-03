import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { InvitationsModule } from '../invitations/invitations.module';

@Module({
  imports: [AuthModule, InvitationsModule],
  controllers: [MeController],
})
export class MeModule {}
