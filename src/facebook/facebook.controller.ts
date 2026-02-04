import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FacebookService } from './facebook.service';
import { PostsService } from '../posts/posts.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { UpdateFacebookConnectionDto } from './dto/update-facebook-connection.dto';

@Controller('facebook')
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly postsService: PostsService,
  ) {}

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

  @Get('connections/:connectionId/posts')
  @UseGuards(AuthGuard)
  async getConnectionPosts(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: UserInfo,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.postsService.findByConnectionId(
      connectionId,
      user.userId,
      pageNum,
      limitNum,
    );
  }

  @Get('connections/:connectionId/posts/:facebookPostId')
  @UseGuards(AuthGuard)
  async getSingleFacebookPost(
    @Param('connectionId') connectionId: string,
    @Param('facebookPostId') facebookPostId: string,
    @CurrentUser() user: UserInfo,
  ) {
    const result = await this.facebookService.getSinglePostWithAttachments(
      connectionId,
      facebookPostId,
      user.userId,
    );
    return {
      post: result.post,
      attachments: result.attachments,
    };
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

  @Patch('connections/:connectionId')
  @UseGuards(AuthGuard)
  async updateConnection(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: UserInfo,
    @Body() dto: UpdateFacebookConnectionDto,
  ) {
    return this.facebookService.updateConnectionName(
      connectionId,
      user.userId,
      dto,
    );
  }
}
