import { Controller, Get, UseGuards } from '@nestjs/common';
import { InvitationsService } from '../invitations/invitations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('invitations')
  async getInvitations(@CurrentUser() user: UserInfo) {
    return this.invitationsService.getByInviterId(user.userId);
  }
}
