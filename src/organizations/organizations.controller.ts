import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  async create(
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(dto);
  }

  @Get()
  async getByUser(@CurrentUser() user: UserInfo) {
    return this.organizationsService.getByUserId(user.userId);
  }
}
