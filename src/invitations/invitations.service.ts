import { Injectable, ForbiddenException } from '@nestjs/common';
import { LogtoService } from '../auth/logto.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(private readonly logtoService: LogtoService) {}

  private async verifyUserHasAccess(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === organizationId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'Organization not found or you do not have access to it',
      );
    }
  }

  async create(dto: CreateInvitationDto, userId: string) {
    await this.verifyUserHasAccess(dto.organizationId, userId);

    const payload: Parameters<
      typeof this.logtoService.createOrganizationInvitation
    >[0] = {
      invitee: dto.invitee,
      organizationId: dto.organizationId,
      expiresAt: dto.expiresAt,
      inviterId: userId,
    };

    if (dto.organizationRoleIds?.length) {
      payload.organizationRoleIds = dto.organizationRoleIds;
    }

    if (dto.messagePayload !== undefined) {
      payload.messagePayload = dto.messagePayload;
    }

    return this.logtoService.createOrganizationInvitation(payload);
  }

  async getByInviterId(inviterId: string) {
    return this.logtoService.getOrganizationInvitations({ inviterId });
  }
}
