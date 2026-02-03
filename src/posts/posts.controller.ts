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
import { RequiresOrganizationGuard } from '../auth/requires-organization.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserInfo } from '../common/interfaces/user.interface';
import { GetPostsQueryDto } from './dto/get-posts-query.dto';

@Controller('posts')
@UseGuards(AuthGuard, RequiresOrganizationGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: UserInfo,
    @Query() query: GetPostsQueryDto,
  ) {
    return this.postsService.findAll(
      user,
      query.page || 1,
      query.limit || 20,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    return this.postsService.findOne(id, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: UserInfo) {
    await this.postsService.remove(id, user);
    return { message: 'Post deleted successfully' };
  }
}
