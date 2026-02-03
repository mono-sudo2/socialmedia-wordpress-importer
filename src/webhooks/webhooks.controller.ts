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
import { WebhooksService } from './webhooks.service';
import { AuthGuard } from '../auth/auth.guard';
import { RequiresOrganizationGuard } from '../auth/requires-organization.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateWebhookConfigDto } from './dto/create-webhook-config.dto';
import { UpdateWebhookConfigDto } from './dto/update-webhook-config.dto';

@Controller('webhooks')
@UseGuards(AuthGuard, RequiresOrganizationGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('config')
  async createConfig(
    @CurrentUser() user: UserInfo,
    @Body() dto: CreateWebhookConfigDto,
  ) {
    const config = await this.webhooksService.createConfig(user, dto);
    return {
      ...config,
      encryptedAuthKey: undefined, // Don't expose encrypted key
    };
  }

  @Get('config/:facebookConnectionId')
  async getConfigs(
    @Param('facebookConnectionId') facebookConnectionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    const configs = await this.webhooksService.getConfigs(
      facebookConnectionId,
      user,
    );
    return configs.map((config) => ({
      ...config,
      encryptedAuthKey: undefined, // Don't expose encrypted key
    }));
  }

  @Put('config/:id')
  async updateConfig(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: UpdateWebhookConfigDto,
  ) {
    const config = await this.webhooksService.updateConfig(id, user, dto);
    return {
      ...config,
      encryptedAuthKey: undefined, // Don't expose encrypted key
    };
  }

  @Delete('config/:id')
  async deleteConfig(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    await this.webhooksService.deleteConfig(id, user);
    return { message: 'Webhook config deleted successfully' };
  }

  @Post('test/:id')
  async sendTestWebhook(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.webhooksService.sendTestWebhook(id, user);
  }
}
