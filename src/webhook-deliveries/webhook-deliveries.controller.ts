import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value == null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 1 ? defaultValue : parsed;
}

@Controller('webhook-deliveries')
@UseGuards(AuthGuard)
export class WebhookDeliveriesController {
  constructor(
    private readonly webhookDeliveriesService: WebhookDeliveriesService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: UserInfo,
    @Query('postId') postId?: string,
    @Query('websiteId') websiteId?: string,
    @Query('status') status?: 'success' | 'failed',
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    return this.webhookDeliveriesService.findAll(user.userId, {
      postId: postId || undefined,
      websiteId: websiteId || undefined,
      status: status || undefined,
      page: parsePositiveInt(pageStr, 1),
      limit: parsePositiveInt(limitStr, 20),
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.webhookDeliveriesService.findOne(id, user.userId);
  }
}
