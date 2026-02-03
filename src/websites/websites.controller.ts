import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Website } from '../database/entities/website.entity';
import { WebsitesService } from './websites.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { ConnectWebsiteDto } from './dto/connect-website.dto';

@Controller('organizations/:organizationId/websites')
@UseGuards(AuthGuard)
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Post()
  async create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateWebsiteDto,
  ) {
    const website = await this.websitesService.createWebsite(
      organizationId,
      user.userId,
      dto,
    );
    return this.sanitizeWebsite(website);
  }

  @Get()
  async findAll(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: UserInfo,
  ) {
    const websites = await this.websitesService.getWebsites(
      organizationId,
      user.userId,
    );
    return websites.map((w) => this.sanitizeWebsite(w));
  }

  @Get(':websiteId')
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
  ) {
    const website = await this.websitesService.getWebsiteById(
      websiteId,
      organizationId,
      user.userId,
    );
    return this.sanitizeWebsite(website);
  }

  @Put(':websiteId')
  async update(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: UpdateWebsiteDto,
  ) {
    const website = await this.websitesService.updateWebsite(
      websiteId,
      organizationId,
      user.userId,
      dto,
    );
    return this.sanitizeWebsite(website);
  }

  @Delete(':websiteId')
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.websitesService.deleteWebsite(
      websiteId,
      organizationId,
      user.userId,
    );
    return { message: 'Website deleted successfully' };
  }

  @Post(':websiteId/connect')
  async connect(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: ConnectWebsiteDto,
  ) {
    await this.websitesService.connectToFacebookConnection(
      websiteId,
      dto.facebookConnectionId,
      organizationId,
      user.userId,
    );
    return { message: 'Website connected to Facebook connection successfully' };
  }

  @Delete(':websiteId/connect/:facebookConnectionId')
  async disconnect(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @Param('facebookConnectionId') facebookConnectionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.websitesService.disconnectFromFacebookConnection(
      websiteId,
      facebookConnectionId,
      organizationId,
      user.userId,
    );
    return { message: 'Website disconnected from Facebook connection successfully' };
  }

  @Get(':websiteId/connections')
  async getConnections(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.websitesService.getWebsiteConnections(
      websiteId,
      organizationId,
      user.userId,
    );
  }

  @Post(':websiteId/test')
  async sendTest(
    @Param('organizationId') organizationId: string,
    @Param('websiteId') websiteId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.websitesService.sendTestWebhook(
      websiteId,
      organizationId,
      user.userId,
    );
  }

  private sanitizeWebsite(website: Website) {
    const { encryptedAuthKey, ...rest } = website;
    return rest;
  }
}
