import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsController } from './posts.controller';
import { PostsRootController } from './posts-root.controller';
import { PostsService } from './posts.service';
import { Post } from '../database/entities/post.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { AuthModule } from '../auth/auth.module';
import { WebsitesModule } from '../websites/websites.module';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, FacebookConnection]),
    AuthModule,
    WebsitesModule,
    forwardRef(() => FacebookModule),
  ],
  controllers: [PostsController, PostsRootController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
