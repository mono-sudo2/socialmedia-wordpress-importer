import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { GetPostsQueryDto } from './dto/get-posts-query.dto';

@Controller('organizations/:organizationId/posts')
@UseGuards(AuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  async findAll(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: UserInfo,
    @Query() query: GetPostsQueryDto,
  ) {
    return this.postsService.findAll(
      organizationId,
      user.userId,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get(':postId')
  async findOne(
    @Param('organizationId') organizationId: string,
    @Param('postId') postId: string,
    @CurrentUser() user: UserInfo,
  ) {
    return this.postsService.findOne(postId, organizationId, user.userId);
  }

  @Delete(':postId')
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('postId') postId: string,
    @CurrentUser() user: UserInfo,
  ) {
    await this.postsService.remove(postId, organizationId, user.userId);
    return { message: 'Post deleted successfully' };
  }
}
