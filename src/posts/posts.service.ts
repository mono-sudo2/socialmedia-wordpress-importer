import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../database/entities/post.entity';
import { LogtoService } from '../auth/logto.service';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    private logtoService: LogtoService,
  ) {}

  private async verifyUserHasAccess(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === organizationId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'Organization not found or you do not have access to it',
      );
    }
  }

  async findAll(
    organizationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Post[]; total: number; page: number; limit: number }> {
    await this.verifyUserHasAccess(organizationId, userId);

    const [data, total] = await this.postRepository.findAndCount({
      where: { logtoOrgId: organizationId },
      order: { postedAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
      relations: ['facebookConnection'],
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<Post> {
    await this.verifyUserHasAccess(organizationId, userId);

    const post = await this.postRepository.findOne({
      where: { id, logtoOrgId: organizationId },
      relations: ['facebookConnection'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async remove(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyUserHasAccess(organizationId, userId);

    const result = await this.postRepository.delete({
      id,
      logtoOrgId: organizationId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Post not found');
    }
  }
}
