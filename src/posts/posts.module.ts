import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post } from '../database/entities/post.entity';
import { Organization } from '../database/entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Organization])],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
