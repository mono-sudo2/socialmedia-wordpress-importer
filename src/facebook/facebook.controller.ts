import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { FacebookService } from './facebook.service';
import { AuthGuard } from '../auth/auth.guard';
import { RequiresOrganizationGuard } from '../auth/requires-organization.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';

@Controller('facebook')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @Get('auth')
  @UseGuards(AuthGuard, RequiresOrganizationGuard)
  async initiateAuth(
    @CurrentUser() user: UserInfo,
    @Res() res: Response,
  ): Promise<void> {
    const state = Buffer.from(
      JSON.stringify({ organizationId: user.organizationId }),
    ).toString('base64');
    const authUrl = this.facebookService.getAuthUrl(state);
    res.redirect(authUrl);
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.redirect(`/?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code) {
      res.redirect('/?error=missing_code');
      return;
    }

    try {
      const stateData = JSON.parse(
        Buffer.from(state, 'base64').toString('utf8'),
      );
      const { organizationId } = stateData;

      const tokenData = await this.facebookService.exchangeCodeForToken(code);
      const pages = await this.facebookService.getPages(tokenData.accessToken);

      // For now, use the first page or user's profile
      const pageId = pages.length > 0 ? pages[0].id : undefined;

      await this.facebookService.saveConnection(
        { userId: '', organizationId }, // userId not needed here
        tokenData.userId,
        tokenData.accessToken,
        tokenData.expiresIn,
        pageId,
      );

      res.redirect('/?success=connected');
    } catch (err) {
      res.redirect(`/?error=${encodeURIComponent(err.message)}`);
    }
  }

  @Get('status')
  @UseGuards(AuthGuard, RequiresOrganizationGuard)
  async getStatus(@CurrentUser() user: UserInfo) {
    return this.facebookService.getConnectionStatus(user.organizationId!);
  }

  @Get('connections/:connectionId/test')
  @UseGuards(AuthGuard)
  async testConnection(
    @Param('connectionId') connectionId: string,
    @Query('since') since: string | undefined,
    @CurrentUser() user: UserInfo,
  ) {
    const sinceTimestamp = since ? parseInt(since, 10) : undefined;
    return this.facebookService.fetchPostsForConnectionByUser(
      connectionId,
      user.userId,
      sinceTimestamp,
    );
  }

  @Delete('connections/:connectionId')
  @UseGuards(AuthGuard, RequiresOrganizationGuard)
  async deleteConnection(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.facebookService.deleteConnection(
      connectionId,
      user.organizationId!,
    );
    return { message: 'Connection removed successfully' };
  }
}
