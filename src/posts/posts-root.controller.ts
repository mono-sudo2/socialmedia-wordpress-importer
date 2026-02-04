import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { WebsitesService } from '../websites/websites.service';
import { FacebookService } from '../facebook/facebook.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';

@Controller('posts')
@UseGuards(AuthGuard)
export class PostsRootController {
  constructor(
    private readonly postsService: PostsService,
    private readonly websitesService: WebsitesService,
    private readonly facebookService: FacebookService,
  ) {}

  @Get(':id')
  async findOne(
    @Param('id') postId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.postsService.findOneById(postId, user.userId);
  }

  @Post(':id/resend')
  async resend(
    @Param('id') postId: string,
    @CurrentUser() user: UserInfo,
  ) {
    const post = await this.postsService.findOneById(postId, user.userId);
    const { post: fbPost, attachments } =
      await this.facebookService.getSinglePostWithAttachments(
        post.facebookConnectionId,
        post.facebookPostId,
        user.userId,
      );
    
    // Transform attachments into simplified structure
    const transformedAttachments = this.facebookService.transformAttachments(
      attachments,
    );
    
    // Exclude attachments from metadata if present
    const { attachments: _, ...metadataWithoutAttachments } =
      (fbPost.metadata as Record<string, unknown>) || {};
    
    const postPayload = {
      content: (fbPost.message as string) || (fbPost.story as string) || '',
      postType: (fbPost.type as string) || 'status',
      metadata: metadataWithoutAttachments,
      attachments:
        transformedAttachments.length > 0 ? transformedAttachments : null,
      postedAt: post.postedAt,
    };
    const deliveries =
      await this.websitesService.resendWebhooksForPostWithPayload(
        post,
        postPayload,
      );
    return {
      success: true,
      message: 'Webhooks resent',
      deliveries: deliveries.map((d) => ({
        id: d.id,
        websiteId: d.websiteId,
        websiteName: d.website?.name ?? null,
        status: d.status,
        statusCode: d.statusCode,
        errorMessage: d.errorMessage,
        sentAt: d.sentAt,
      })),
    };
  }
}
