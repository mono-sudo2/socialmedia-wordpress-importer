import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Controller('invitations')
@UseGuards(AuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  async create(
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(dto, user.userId);
  }
}
