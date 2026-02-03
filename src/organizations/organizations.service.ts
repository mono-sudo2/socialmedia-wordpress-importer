import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { LogtoService } from '../auth/logto.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import axios from 'axios';

@Injectable()
export class OrganizationsService {
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
}
