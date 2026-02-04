import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FacebookSyncService } from './facebook-sync.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value == null || value === '') return defaultValue;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0) return defaultValue;
  return n;
}

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly facebookSyncService: FacebookSyncService) {}

  @Get('sync/:connectionId')
  @UseGuards(AuthGuard)
  async triggerSyncForConnection(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: UserInfo,
    @Query('window') windowStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const hasPagination =
      windowStr != null ||
      offsetStr != null ||
      limitStr != null;

    let options: { window: number; offset: number; limit: number } | undefined;

    if (hasPagination) {
      const window = Math.min(
        Math.max(parsePositiveInt(windowStr, 10), 1),
        100,
      );
      const offset = Math.max(parsePositiveInt(offsetStr, 0), 0);

      if (offset >= window) {
        throw new BadRequestException('offset must be less than window');
      }

      const defaultLimit = Math.min(10, window - offset);
      const limit = Math.min(
        Math.max(parsePositiveInt(limitStr, defaultLimit), 1),
        window - offset,
      );

      if (offset + limit > window) {
        throw new BadRequestException(
          'offset + limit must not exceed window',
        );
      }

      options = { window, offset, limit };
    }

    const { postsProcessed } =
      await this.facebookSyncService.syncConnectionById(
        connectionId,
        user.userId,
        options,
      );

    const response: Record<string, unknown> = {
      success: true,
      connectionId,
      postsProcessed,
    };
    if (options) {
      response.window = options.window;
      response.offset = options.offset;
      response.limit = options.limit;
    }
    return response;
  }

  @Post('sync')
  @UseGuards(AuthGuard)
  async triggerSync() {
    const { connectionsCount } =
      await this.facebookSyncService.syncAllConnections();
    return {
      success: true,
      message: 'Sync completed',
      connectionsCount,
    };
  }
}
