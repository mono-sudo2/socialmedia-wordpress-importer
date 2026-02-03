import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../database/entities/post.entity';
import { UserInfo } from '../common/interfaces/user.interface';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
  ) {}

  async findAll(
    userInfo: UserInfo,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Post[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.postRepository.findAndCount({
      where: { logtoOrgId: userInfo.organizationId },
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

  async findOne(id: string, userInfo: UserInfo): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id, logtoOrgId: userInfo.organizationId },
      relations: ['facebookConnection'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async remove(id: string, userInfo: UserInfo): Promise<void> {
    const result = await this.postRepository.delete({
      id,
      logtoOrgId: userInfo.organizationId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Post not found');
    }
  }
}
