import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { InvitationsModule } from '../invitations/invitations.module';

@Module({
  imports: [InvitationsModule],
  controllers: [MeController],
})
export class MeModule {}
