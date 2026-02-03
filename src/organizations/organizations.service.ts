import { Injectable } from '@nestjs/common';
import { LogtoService } from '../auth/logto.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly logtoService: LogtoService) {}

  async create(dto: CreateOrganizationDto) {
    return this.logtoService.createOrganization({
      name: dto.name,
      description: dto.description,
    });
  }

  async getByUserId(userId: string) {
    return this.logtoService.getUserOrganizations(userId);
  }
}
