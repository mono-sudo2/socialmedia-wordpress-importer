import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { GetOrganizationUsersQueryDto } from './dto/get-organization-users-query.dto';
import { WebsitesService } from '../websites/websites.service';
import { CreateWebsiteDto } from '../websites/dto/create-website.dto';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly websitesService: WebsitesService,
  ) {}

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

  @Get(':id/facebook/auth')
  async initiateFacebookAuth(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Res() res: Response,
  ) {
    const authUrl = await this.organizationsService.getFacebookAuthUrl(
      id,
      user.userId,
    );
    res.redirect(authUrl);
  }

  @Delete(':id/facebook/connections/:connectionId')
  async deleteFacebookConnection(
    @Param('id') id: string,
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.organizationsService.deleteFacebookConnection(
      id,
      connectionId,
      user.userId,
    );
    return { message: 'Connection removed successfully' };
  }

  @Get(':id/websites')
  async getWebsites(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    const websites = await this.websitesService.getWebsites(id, user.userId);
    return websites.map((w) => {
      const { encryptedAuthKey, ...rest } = w;
      return rest;
    });
  }

  @Post(':id/websites')
  async createWebsite(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateWebsiteDto,
  ) {
    const website = await this.websitesService.createWebsite(
      id,
      user.userId,
      dto,
    );
    const { encryptedAuthKey, ...rest } = website;
    return rest;
  }

  @Get(':id/facebook')
  async getFacebookConnections(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.organizationsService.getFacebookConnections(id, user.userId);
  }

  @Get(':id/invitations')
  async getInvitations(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.organizationsService.getInvitations(id, user.userId);
  }

  @Get(':id/users')
  async getUsers(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Query() query: GetOrganizationUsersQueryDto,
  ) {
    return this.organizationsService.getUsers(id, user.userId, {
      q: query.q,
      page: query.page,
      page_size: query.page_size,
    });
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
