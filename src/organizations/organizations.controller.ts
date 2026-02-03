import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  async create(
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(dto, user.userId);
  }

  @Get()
  async getByUser(@CurrentUser() user: UserInfo) {
    return this.organizationsService.getByUserId(user.userId);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    return this.organizationsService.getById(id, user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, dto, user.userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    await this.organizationsService.delete(id, user.userId);
    return { message: 'Organization deleted successfully' };
  }
}
