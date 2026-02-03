import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../database/entities/post.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserInfo } from '../common/interfaces/user.interface';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
  ) {}

  async findAll(
    userInfo: UserInfo,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Post[]; total: number; page: number; limit: number }> {
    const organization = await this.organizationRepository.findOne({
      where: { logtoOrgId: userInfo.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const [data, total] = await this.postRepository.findAndCount({
      where: { organizationId: organization.id },
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
    const organization = await this.organizationRepository.findOne({
      where: { logtoOrgId: userInfo.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const post = await this.postRepository.findOne({
      where: { id, organizationId: organization.id },
      relations: ['facebookConnection'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async remove(id: string, userInfo: UserInfo): Promise<void> {
    const organization = await this.organizationRepository.findOne({
      where: { logtoOrgId: userInfo.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const result = await this.postRepository.delete({
      id,
      organizationId: organization.id,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Post not found');
    }
  }
}
