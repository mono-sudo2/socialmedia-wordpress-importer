import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LogtoService } from '../auth/logto.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import type { UserInfo } from '../common/interfaces/user.interface';
import axios from 'axios';

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

  async getByInvitee(user: UserInfo) {
    const email = await this.resolveUserEmail(user);
    return this.logtoService.getOrganizationInvitations({ invitee: email });
  }

  private async getInvitationOrThrow(id: string) {
    try {
      return (await this.logtoService.getOrganizationInvitation(id)) as {
        id: string;
        organizationId: string;
        invitee: string;
        status: string;
        expiresAt: number;
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Invitation not found');
      }
      throw error;
    }
  }

  private async resolveUserEmail(user: UserInfo): Promise<string> {
    if (user.email) {
      return user.email;
    }
    try {
      const logtoUser = (await this.logtoService.getUser(user.userId)) as {
        primaryEmail?: string;
      };
      if (logtoUser?.primaryEmail) {
        return logtoUser.primaryEmail;
      }
    } catch {
      // Fall through to throw
    }
    throw new ForbiddenException(
      'Cannot verify invitee identity: email not available',
    );
  }

  private async verifyInvitee(invitationId: string, user: UserInfo) {
    const invitation = await this.getInvitationOrThrow(invitationId);

    if (invitation.status !== 'Pending') {
      throw new BadRequestException(
        `Invitation cannot be accepted or denied: status is ${invitation.status}`,
      );
    }

    if (invitation.expiresAt < Date.now()) {
      throw new BadRequestException('Invitation has expired');
    }

    const userEmail = await this.resolveUserEmail(user);
    const inviteeEmail = (invitation.invitee || '').toLowerCase().trim();
    const normalizedUserEmail = userEmail.toLowerCase().trim();

    if (normalizedUserEmail !== inviteeEmail) {
      throw new ForbiddenException(
        'You are not the invited user for this invitation',
      );
    }

    return invitation;
  }

  async accept(invitationId: string, user: UserInfo) {
    await this.verifyInvitee(invitationId, user);
    try {
      return await this.logtoService.updateOrganizationInvitationStatus(
        invitationId,
        'Accepted',
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Invitation not found');
      }
      throw error;
    }
  }

  async deny(invitationId: string, user: UserInfo) {
    await this.verifyInvitee(invitationId, user);
    try {
      return await this.logtoService.updateOrganizationInvitationStatus(
        invitationId,
        'Revoked',
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Invitation not found');
      }
      throw error;
    }
  }

  async revoke(invitationId: string, userId: string) {
    const invitation = await this.getInvitationOrThrow(invitationId);
    await this.verifyUserHasAccess(invitation.organizationId, userId);
    try {
      return await this.logtoService.updateOrganizationInvitationStatus(
        invitationId,
        'Revoked',
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Invitation not found');
      }
      throw error;
    }
  }
}
