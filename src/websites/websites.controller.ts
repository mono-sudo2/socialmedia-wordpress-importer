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
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { ConnectWebsiteDto } from './dto/connect-website.dto';

@Controller('websites')
@UseGuards(AuthGuard)
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    const website = await this.websitesService.getWebsiteById(id, user.userId);
    return this.sanitizeWebsite(website);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: UpdateWebsiteDto,
  ) {
    const website = await this.websitesService.updateWebsite(
      id,
      user.userId,
      dto,
    );
    return this.sanitizeWebsite(website);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    await this.websitesService.deleteWebsite(id, user.userId);
    return { message: 'Website deleted successfully' };
  }

  @Post(':id/connect')
  async connect(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: ConnectWebsiteDto,
  ) {
    await this.websitesService.connectToFacebookConnection(
      id,
      dto.facebookConnectionId,
      user.userId,
    );
    return { message: 'Website connected to Facebook connection successfully' };
  }

  @Delete(':id/connect/:facebookConnectionId')
  async disconnect(
    @Param('id') id: string,
    @Param('facebookConnectionId') facebookConnectionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.websitesService.disconnectFromFacebookConnection(
      id,
      facebookConnectionId,
      user.userId,
    );
    return { message: 'Website disconnected from Facebook connection successfully' };
  }

  @Get(':id/connections')
  async getConnections(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    return this.websitesService.getWebsiteConnections(id, user.userId);
  }

  @Post(':id/test')
  async sendTest(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    return this.websitesService.sendTestWebhook(id, user.userId);
  }

  private sanitizeWebsite(website: Website) {
    const { encryptedAuthKey, ...rest } = website;
    return rest;
  }
}
