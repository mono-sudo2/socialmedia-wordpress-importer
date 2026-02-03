import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { LogtoService } from '../auth/logto.service';
import { FacebookService } from '../facebook/facebook.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import axios from 'axios';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly logtoService: LogtoService,
    private readonly facebookService: FacebookService,
  ) {}

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

  async create(dto: CreateOrganizationDto, userId: string) {
    const organization = (await this.logtoService.createOrganization({
      name: dto.name,
      description: dto.description,
    })) as { id: string };

    await this.logtoService.addUserToOrganization(organization.id, userId);

    return organization;
  }

  async getByUserId(userId: string) {
    return this.logtoService.getUserOrganizations(userId);
  }

  async getById(id: string, userId: string) {
    await this.verifyUserHasAccess(id, userId);
    try {
      return await this.logtoService.getOrganization(id);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Organization not found');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateOrganizationDto, userId: string) {
    await this.verifyUserHasAccess(id, userId);
    try {
      return await this.logtoService.updateOrganization(id, {
        name: dto.name,
        description: dto.description,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Organization not found');
      }
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    await this.verifyUserHasAccess(id, userId);
    try {
      await this.logtoService.deleteOrganization(id);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Organization not found');
      }
      throw error;
    }
  }

  async getInvitations(id: string, userId: string) {
    await this.verifyUserHasAccess(id, userId);
    try {
      return await this.logtoService.getOrganizationInvitations({
        organizationId: id,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Organization not found');
      }
      throw error;
    }
  }

  async getUsers(
    id: string,
    userId: string,
    query?: { q?: string; page?: number; page_size?: number },
  ) {
    await this.verifyUserHasAccess(id, userId);
    try {
      return await this.logtoService.getOrganizationUsers(id, query);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Organization not found');
      }
      throw error;
    }
  }

  async getFacebookConnections(
    id: string,
    userId: string,
  ): Promise<
    Array<{
      id: string;
      facebookUserId: string;
      pageId: string | null;
      isActive: boolean;
      createdAt: Date;
      lastSyncAt: Date | null;
      tokenExpiresAt: Date | null;
    }>
  > {
    await this.verifyUserHasAccess(id, userId);
    const connections = await this.facebookService.getConnections(id);
    return connections.map((c) => ({
      id: c.id,
      facebookUserId: c.facebookUserId,
      pageId: c.pageId,
      isActive: c.isActive,
      createdAt: c.createdAt,
      lastSyncAt: c.lastSyncAt,
      tokenExpiresAt: c.tokenExpiresAt,
    }));
  }

  async getFacebookAuthUrl(
    organizationId: string,
    userId: string,
  ): Promise<string> {
    await this.verifyUserHasAccess(organizationId, userId);
    const state = Buffer.from(
      JSON.stringify({ organizationId }),
    ).toString('base64');
    return this.facebookService.getAuthUrl(state);
  }

  async deleteFacebookConnection(
    organizationId: string,
    connectionId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyUserHasAccess(organizationId, userId);
    await this.facebookService.deleteConnection(connectionId, organizationId);
  }
}
